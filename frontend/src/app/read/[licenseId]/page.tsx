'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { API_BASE_URL, apiClient } from '@/lib/api';
import { decryptLcpdf, decryptEpub, getLcplLink, verifyLcplSignature, validatePassphrase, type Lcpl } from '@/lib/lcpDecrypt';
import { License } from '@/types';
import styles from './page.module.css';

// ── PDF.js ──────────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { pdfjsLib: any; }
}

async function loadPdfJs(): Promise<void> {
  if (window.pdfjsLib) return;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url,
  ).toString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.pdfjsLib = pdfjs as any;
}

// ── EPUB iframe helpers ───────────────────────────────────────────────────────

function getEpubIframeDoc(container: HTMLDivElement | null): Document | null {
  return (container?.querySelector('iframe') as HTMLIFrameElement | null)
    ?.contentDocument ?? null;
}

function clearEpubHighlights(doc: Document) {
  doc.querySelectorAll('mark.epub-hl').forEach(m => {
    const parent = m.parentNode;
    if (!parent) return;
    m.replaceWith(...Array.from(m.childNodes));
    parent.normalize();
  });
}

function highlightEpubDoc(doc: Document, query: string): Element[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const marks: Element[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName.toUpperCase();
      if (tag === 'MARK' || tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if ((node.textContent?.toLowerCase() ?? '').includes(q)) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_REJECT;
    },
  });

  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);

  for (const textNode of nodes) {
    const text = textNode.textContent ?? '';
    const lower = text.toLowerCase();
    const frag = doc.createDocumentFragment();
    let cursor = 0;
    let pos: number;

    while ((pos = lower.indexOf(q, cursor)) !== -1) {
      if (pos > cursor) frag.appendChild(doc.createTextNode(text.slice(cursor, pos)));
      const mark = doc.createElement('mark');
      mark.className = 'epub-hl';
      mark.textContent = text.slice(pos, pos + q.length);
      frag.appendChild(mark);
      marks.push(mark);
      cursor = pos + q.length;
    }
    if (cursor < text.length) frag.appendChild(doc.createTextNode(text.slice(cursor)));
    textNode.replaceWith(frag);
  }

  return marks;
}

// ── Constants ────────────────────────────────────────────────────────────────
const BASE_SCALE = 1.8;

const ZOOM_LEVELS = [
  { label: '50%',  factor: 0.50 },
  { label: '75%',  factor: 0.75 },
  { label: '100%', factor: 1.00 },
  { label: '125%', factor: 1.25 },
  { label: '150%', factor: 1.50 },
  { label: '200%', factor: 2.00 },
];
const DEFAULT_ZOOM_IDX = 2;

type Phase      = 'loading-license' | 'passphrase' | 'decrypting' | 'rendering' | 'ready' | 'error';
type BookFormat = 'pdf' | 'epub' | null;

// ── Component ────────────────────────────────────────────────────────────────
export default function ReaderPage() {
  const { licenseId } = useParams<{ licenseId: string }>();
  const router = useRouter();

  const [phase, setPhase]             = useState<Phase>('loading-license');
  const [bookFormat, setBookFormat]   = useState<BookFormat>(null);
  const [lcpl, setLcpl]               = useState<Lcpl | null>(null);
  const [bookTitle, setBookTitle]     = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const [passphrase, setPassphrase]   = useState('');
  const [statusMsg, setStatusMsg]     = useState('');
  const [totalPages, setTotalPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpInput, setJumpInput]     = useState('1');
  const [zoomIdx, setZoomIdx]         = useState(DEFAULT_ZOOM_IDX);

  // PDF search
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchHits, setSearchHits]     = useState<{ page: number; count: number }[]>([]);
  const [searchHitIdx, setSearchHitIdx] = useState(0);
  const [searching, setSearching]       = useState(false);

  // EPUB navigation
  const [epubAtStart, setEpubAtStart]   = useState(true);
  const [epubAtEnd, setEpubAtEnd]       = useState(false);
  const [epubChapter, setEpubChapter]   = useState('');
  const [epubProgress, setEpubProgress] = useState(0);

  // EPUB search
  const [epubSearchOpen, setEpubSearchOpen]       = useState(false);
  const [epubSearchQuery, setEpubSearchQuery]     = useState('');
  const [epubSearching, setEpubSearching]         = useState(false);
  const [epubSearchMarks, setEpubSearchMarks]     = useState<Element[]>([]);
  const [epubSearchMarkIdx, setEpubSearchMarkIdx] = useState(0);

  const viewerRef           = useRef<HTMLDivElement>(null);
  const epubRef             = useRef<HTMLDivElement>(null);
  const passphraseInputRef  = useRef<HTMLInputElement>(null);
  const jumpInputRef        = useRef<HTMLInputElement>(null);
  const searchInputRef      = useRef<HTMLInputElement>(null);
  const epubSearchInputRef  = useRef<HTMLInputElement>(null);
  const observerRef         = useRef<IntersectionObserver | null>(null);
  const renderObserverRef   = useRef<IntersectionObserver | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef           = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPageFnRef     = useRef<((n: number) => Promise<void>) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const epubBookRef         = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const epubRenditionRef    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const epubTocRef          = useRef<any[]>([]);
  const programmaticScroll  = useRef(false);
  const zoomRef             = useRef(ZOOM_LEVELS[DEFAULT_ZOOM_IDX].factor);

  // ── Step 1: license + title ───────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`${API_BASE_URL}/licenses/${licenseId}/download`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
        }
        const data: Lcpl = await res.json();
        setLcpl(data);

        try {
          const ld = await apiClient.get('/licenses');
          const licenses: License[] = ld.data || [];
          const match = licenses.find(l => l.ID === parseInt(licenseId, 10));
          setBookTitle(match?.book?.title || getLcplLink(data, 'publication')?.title || '');
        } catch {
          setBookTitle(getLcplLink(data, 'publication')?.title || '');
        }

        setStatusMsg('Memverifikasi lisensi...');
        await verifyLcplSignature(data);

        const pubLink = getLcplLink(data, 'publication');
        setBookFormat(pubLink?.href?.endsWith('.epub') ? 'epub' : 'pdf');
        setPhase('passphrase');
        setTimeout(() => passphraseInputRef.current?.focus(), 100);
      } catch (e: unknown) {
        setErrorMsg((e as Error).message || 'Gagal memuat lisensi');
        setPhase('error');
      }
    }
    init();
  }, [licenseId]);

  // ── Step 2: decrypt + render ──────────────────────────────────────────────
  const handleSubmitPassphrase = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lcpl || !passphrase.trim()) return;
    setPhase('decrypting');

    try {
      const pubLink = getLcplLink(lcpl, 'publication');
      if (!pubLink) throw new Error('Link publikasi tidak ditemukan di lisensi');
      const isEpub = pubLink.href.endsWith('.epub');

      // Validasi passphrase lebih awal — sebelum download konten besar
      setStatusMsg('Memvalidasi sandi...');
      await validatePassphrase(passphrase.trim(), lcpl);

      if (!isEpub) {
        setStatusMsg('Memuat PDF renderer...');
        await loadPdfJs();
      }

      setStatusMsg('Mengunduh konten terenkripsi...');
      const contentRes = await fetch(pubLink.href);
      if (!contentRes.ok) throw new Error(`Gagal mengunduh konten: HTTP ${contentRes.status}`);
      const buffer = await contentRes.arrayBuffer();

      setStatusMsg('Mendekripsi...');
      if (isEpub) {
        const decryptedEpub = await decryptEpub(passphrase.trim(), lcpl, buffer);
        setPhase('rendering');
        setStatusMsg('Merender buku...');
        await renderEpub(decryptedEpub.buffer as ArrayBuffer);
      } else {
        const pdfBytes = await decryptLcpdf(passphrase.trim(), lcpl, buffer);
        setPhase('rendering');
        setStatusMsg('Merender halaman...');
        await renderPdf(pdfBytes);
      }

      setPhase('ready');
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || 'Terjadi kesalahan saat memproses dokumen');
      setPhase('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lcpl, passphrase]);

  // ── EPUB render ───────────────────────────────────────────────────────────
  const renderEpub = useCallback(async (epubBuffer: ArrayBuffer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { default: ePub } = await import('epubjs') as any;
    const book = ePub(epubBuffer);
    epubBookRef.current = book;

    await book.ready;
    try {
      await book.loaded.navigation;
      epubTocRef.current = book.navigation?.toc || [];
    } catch { /* TOC optional */ }

    const container = epubRef.current;
    if (!container) return;

    const rendition = book.renderTo(container, {
      width:                '100%',
      height:               '100%',
      spread:               'none',
      flow:                 'scrolled-doc',
      allowScriptedContent: false,
    });
    epubRenditionRef.current = rendition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rendition.on('relocated', (location: any) => {
      setEpubAtStart(location.atStart ?? false);
      setEpubAtEnd(location.atEnd ?? false);
      setEpubProgress(Math.round((location.start?.percentage ?? 0) * 100));
      const href = location.start?.href || '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findChapter = (items: any[]): string => {
        for (const item of items) {
          if (href.includes(item.href?.split('#')[0] || '')) return item.label?.trim() || '';
          if (item.subitems?.length) {
            const found = findChapter(item.subitems);
            if (found) return found;
          }
        }
        return '';
      };
      setEpubChapter(findChapter(epubTocRef.current));
    });

    // Jembatan keyboard iframe → parent: inject listener setelah iframe tersedia.
    // Karena handler ini didefinisikan di parent frame (bukan di dalam iframe),
    // closurenya memiliki akses langsung ke state React (router, setEpubSearchOpen, dsb).
    let keyBridgeAdded = false;
    rendition.on('rendered', () => {
      if (keyBridgeAdded) return;
      const iframeDoc = getEpubIframeDoc(container);
      if (!iframeDoc) return;
      keyBridgeAdded = true;

      iframeDoc.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') { router.back(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          setEpubSearchOpen(true);
          setTimeout(() => epubSearchInputRef.current?.focus(), 80);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) e.preventDefault();
      });
      iframeDoc.addEventListener('contextmenu', (ev: Event) => ev.preventDefault());

      // Inject CSS highlight style ke dalam iframe
      const style = iframeDoc.createElement('style');
      style.textContent = 'mark.epub-hl{background:rgba(255,218,0,0.55);border-radius:2px;color:inherit;}';
      iframeDoc.head?.appendChild(style);
    });

    await rendition.display();
  }, [router]);

  // ── EPUB chapter navigation ───────────────────────────────────────────────
  const epubNext = useCallback(() => { epubRenditionRef.current?.next?.(); }, []);
  const epubPrev = useCallback(() => { epubRenditionRef.current?.prev?.(); }, []);

  // ── EPUB text search ──────────────────────────────────────────────────────
  const runEpubSearch = useCallback((query: string) => {
    const doc = getEpubIframeDoc(epubRef.current);
    if (!doc) return;

    setEpubSearching(true);
    clearEpubHighlights(doc);

    const q = query.trim();
    if (!q) {
      setEpubSearchMarks([]);
      setEpubSearching(false);
      return;
    }

    const marks = highlightEpubDoc(doc, q);
    setEpubSearchMarks(marks);
    setEpubSearchMarkIdx(0);
    setEpubSearching(false);

    if (marks.length > 0) {
      marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const jumpEpubMark = useCallback((delta: number) => {
    setEpubSearchMarkIdx(prev => {
      if (epubSearchMarks.length === 0) return prev;
      const next = (prev + delta + epubSearchMarks.length) % epubSearchMarks.length;
      epubSearchMarks[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return next;
    });
  }, [epubSearchMarks]);

  const handleEpubSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    runEpubSearch(epubSearchQuery);
  }, [epubSearchQuery, runEpubSearch]);

  const clearEpubSearch = useCallback(() => {
    const doc = getEpubIframeDoc(epubRef.current);
    if (doc) clearEpubHighlights(doc);
    setEpubSearchQuery('');
    setEpubSearchMarks([]);
  }, []);

  // ── PDF render — lazy, per-page on demand ────────────────────────────────
  const renderPdf = useCallback(async (pdfBytes: Uint8Array) => {
    const pdfjsLib = window.pdfjsLib;
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    pdfDocRef.current = pdf;

    const numPages: number = pdf.numPages;
    setTotalPages(numPages);
    setCurrentPage(1);
    setJumpInput('1');

    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.innerHTML = '';
    observerRef.current?.disconnect();
    renderObserverRef.current?.disconnect();

    const zoom = ZOOM_LEVELS[DEFAULT_ZOOM_IDX].factor;

    setStatusMsg('Memuat struktur dokumen...');
    const pageDims: { w: number; h: number }[] = [];
    for (let n = 1; n <= numPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1.0 });
      pageDims.push({ w: vp.width, h: vp.height });
    }

    for (let n = 1; n <= numPages; n++) {
      const { w, h } = pageDims[n - 1];
      const wrapper = document.createElement('div');
      wrapper.className = styles.pageWrapper;
      wrapper.id = `pdf-page-${n}`;
      wrapper.dataset.page = String(n);
      wrapper.dataset.rendered = 'false';
      wrapper.dataset.w = String(w);
      wrapper.dataset.h = String(h);
      applyWrapperZoom(wrapper, zoom);
      viewer.appendChild(wrapper);
    }

    const doRender = async (n: number) => {
      const wrapper = document.getElementById(`pdf-page-${n}`);
      if (!wrapper || wrapper.dataset.rendered !== 'false') return;
      wrapper.dataset.rendered = 'pending';

      const cZoom = zoomRef.current;
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: BASE_SCALE });

      const canvas = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      canvas.className = styles.pdfCanvas;
      canvas.style.width  = (viewport.width  / BASE_SCALE * cZoom) + 'px';
      canvas.style.height = (viewport.height / BASE_SCALE * cZoom) + 'px';
      wrapper.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;

      try {
        const textContent = await page.getTextContent();
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = styles.textLayer;
        textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
        textLayerDiv.style.transform = `scale(${cZoom / BASE_SCALE})`;
        textLayerDiv.style.transformOrigin = '0 0';
        wrapper.appendChild(textLayerDiv);
        if (pdfjsLib.renderTextLayer) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let task: any;
          try {
            task = pdfjsLib.renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] });
          } catch {
            task = pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport });
          }
          if (task?.promise) await task.promise;
        }
      } catch { /* text layer non-fatal */ }

      wrapper.dataset.rendered = 'true';
    };

    renderPageFnRef.current = doRender;

    const lazyObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const n = parseInt((entry.target as HTMLElement).dataset.page || '0', 10);
        if (n > 0) doRender(n);
      }
    }, { rootMargin: '400px 0px' });

    viewer.querySelectorAll<HTMLElement>('[data-page]').forEach(el => lazyObserver.observe(el));
    renderObserverRef.current = lazyObserver;

    setStatusMsg('Merender halaman pertama...');
    for (let n = 1; n <= Math.min(3, numPages); n++) await doRender(n);

    setCurrentPage(1);
    setJumpInput('1');
    setupObserver();
  }, []);

  // ── CSS zoom ─────────────────────────────────────────────────────────────
  function applyWrapperZoom(wrapper: HTMLElement, zoom: number) {
    const w = parseFloat(wrapper.dataset.w || '0');
    const h = parseFloat(wrapper.dataset.h || '0');
    wrapper.style.width  = (w * zoom) + 'px';
    wrapper.style.height = (h * zoom) + 'px';
  }

  useEffect(() => { zoomRef.current = ZOOM_LEVELS[zoomIdx].factor; }, [zoomIdx]);

  useEffect(() => {
    if (phase !== 'ready' || bookFormat !== 'pdf') return;
    const zoom = ZOOM_LEVELS[zoomIdx].factor;
    const tlScale = zoom / BASE_SCALE;
    document.querySelectorAll<HTMLElement>('[data-page]').forEach(wrapper => {
      applyWrapperZoom(wrapper, zoom);
      const canvas = wrapper.querySelector<HTMLCanvasElement>('canvas');
      if (canvas) {
        const w = parseFloat(wrapper.dataset.w || '0');
        const h = parseFloat(wrapper.dataset.h || '0');
        canvas.style.width  = (w * zoom) + 'px';
        canvas.style.height = (h * zoom) + 'px';
      }
      const textLayer = wrapper.querySelector<HTMLElement>(`.${styles.textLayer}`);
      if (textLayer) textLayer.style.transform = `scale(${tlScale})`;
    });
  }, [zoomIdx, phase, bookFormat]);

  // ── IntersectionObserver ──────────────────────────────────────────────────
  function setupObserver() {
    observerRef.current?.disconnect();
    const root = document.querySelector<HTMLElement>(`.${styles.readerMain}`);
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      if (programmaticScroll.current) return;
      let best: IntersectionObserverEntry | null = null;
      for (const entry of entries) {
        if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio))
          best = entry;
      }
      if (best) {
        const pg = parseInt((best.target as HTMLElement).dataset.page || '1', 10);
        setCurrentPage(pg);
        setJumpInput(String(pg));
      }
    }, { root, threshold: [0.1, 0.3, 0.5, 0.8] });
    document.querySelectorAll('[data-page]').forEach(el => observer.observe(el));
    observerRef.current = observer;
  }

  useEffect(() => () => {
    observerRef.current?.disconnect();
    renderObserverRef.current?.disconnect();
    try { epubRenditionRef.current?.destroy?.(); } catch { /* ignore */ }
    try { epubBookRef.current?.destroy?.(); } catch { /* ignore */ }
  }, []);

  // ── Page jump (PDF) ───────────────────────────────────────────────────────
  const scrollToPage = useCallback((pageNum: number, smooth = true) => {
    const clamped = Math.max(1, Math.min(pageNum, totalPages));
    programmaticScroll.current = true;
    setCurrentPage(clamped);
    setJumpInput(String(clamped));
    document.getElementById(`pdf-page-${clamped}`)?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'instant',
      block: 'start',
    });
    clearTimeout((scrollToPage as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
    (scrollToPage as unknown as { _t?: ReturnType<typeof setTimeout> })._t =
      setTimeout(() => { programmaticScroll.current = false; }, 900);
  }, [totalPages]);

  const handleJumpSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpInput, 10);
    if (!isNaN(n)) scrollToPage(n);
    jumpInputRef.current?.blur();
  }, [jumpInput, scrollToPage]);

  // ── PDF highlight helpers ─────────────────────────────────────────────────
  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function clearPdfHighlights() {
    document.querySelectorAll<HTMLElement>('[data-hl-orig]').forEach(el => {
      el.textContent = el.dataset.hlOrig ?? '';
      delete el.dataset.hlOrig;
    });
  }

  function highlightPdfPage(pageNum: number, query: string) {
    const wrapper = document.getElementById(`pdf-page-${pageNum}`);
    if (!wrapper) return;
    const textLayer = wrapper.querySelector<HTMLElement>(`.${styles.textLayer}`);
    if (!textLayer) return;

    const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'));
    const q = query.trim().toLowerCase();
    if (!q || spans.length === 0) return;

    let fullText = '';
    const bounds: { start: number; end: number; el: HTMLElement }[] = [];
    for (const span of spans) {
      const t = span.textContent || '';
      bounds.push({ start: fullText.length, end: fullText.length + t.length, el: span });
      fullText += t;
    }

    const lower = fullText.toLowerCase();
    const matches: { start: number; end: number }[] = [];
    let pos = 0;
    while ((pos = lower.indexOf(q, pos)) !== -1) {
      matches.push({ start: pos, end: pos + q.length });
      pos += q.length;
    }
    if (matches.length === 0) return;

    for (const { start: sStart, end: sEnd, el } of bounds) {
      const relevant = matches.filter(m => m.end > sStart && m.start < sEnd);
      if (relevant.length === 0) continue;
      const spanText = el.textContent || '';
      el.dataset.hlOrig = spanText;
      let html = '';
      let cursor = 0;
      for (const m of relevant) {
        const hlStart = Math.max(m.start, sStart) - sStart;
        const hlEnd   = Math.min(m.end,   sEnd)   - sStart;
        if (cursor < hlStart) html += escapeHtml(spanText.slice(cursor, hlStart));
        html += `<mark class="${styles.highlight}">${escapeHtml(spanText.slice(hlStart, hlEnd))}</mark>`;
        cursor = hlEnd;
      }
      if (cursor < spanText.length) html += escapeHtml(spanText.slice(cursor));
      el.innerHTML = html;
    }
  }

  // ── PDF text search ───────────────────────────────────────────────────────
  const runSearch = useCallback(async (query: string) => {
    if (!pdfDocRef.current || !query.trim()) { setSearchHits([]); return; }
    setSearching(true);
    setSearchHits([]);
    const pdf = pdfDocRef.current;
    const q      = query.trim().toLowerCase();
    const qStrip = q.replace(/\s+/g, '');
    const hits: { page: number; count: number }[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const textContent = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawStrs: string[] = textContent.items.map((item: any) => item.str ?? '');
      const textSpaced = rawStrs.join(' ').replace(/\s+/g, ' ').toLowerCase();
      const textStrip  = rawStrs.join('').toLowerCase();
      const countIn = (text: string, needle: string) => {
        if (!needle) return 0;
        let c = 0, p = 0;
        while ((p = text.indexOf(needle, p)) !== -1) { c++; p += needle.length; }
        return c;
      };
      const count = Math.max(countIn(textSpaced, q), countIn(textStrip, qStrip));
      if (count > 0) hits.push({ page: n, count });
    }
    setSearchHits(hits);
    setSearchHitIdx(0);
    setSearching(false);
    if (renderPageFnRef.current) {
      for (const hit of hits) await renderPageFnRef.current(hit.page);
    }
    clearPdfHighlights();
    for (const hit of hits) highlightPdfPage(hit.page, query);
    if (hits.length > 0) scrollToPage(hits[0].page, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToPage]);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    runSearch(searchQuery);
  }, [searchQuery, runSearch]);

  const jumpSearchHit = useCallback((delta: number) => {
    if (searchHits.length === 0) return;
    const next = (searchHitIdx + delta + searchHits.length) % searchHits.length;
    setSearchHitIdx(next);
    scrollToPage(searchHits[next].page, false);
  }, [searchHits, searchHitIdx, scrollToPage]);

  const totalMatches = searchHits.reduce((s, h) => s + h.count, 0);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (searchOpen) { setSearchOpen(false); return; }
        if (epubSearchOpen) { setEpubSearchOpen(false); return; }
        router.back();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (bookFormat === 'pdf') {
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 80);
        } else if (bookFormat === 'epub') {
          setEpubSearchOpen(true);
          setTimeout(() => epubSearchInputRef.current?.focus(), 80);
        }
        return;
      }
      if (inInput) return;

      if (bookFormat === 'epub') {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') epubNext();
        if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   epubPrev();
      } else {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') scrollToPage(currentPage + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   scrollToPage(currentPage - 1);
        if (e.key === '+' || e.key === '=') setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1));
        if (e.key === '-')                  setZoomIdx(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, currentPage, scrollToPage, searchOpen, epubSearchOpen, bookFormat, epubNext, epubPrev]);

  // ── Anti-save ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const noCtx = (e: MouseEvent) => e.preventDefault();
    const noKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) e.preventDefault();
    };
    document.addEventListener('contextmenu', noCtx);
    document.addEventListener('keydown', noKey);
    return () => {
      document.removeEventListener('contextmenu', noCtx);
      document.removeEventListener('keydown', noKey);
    };
  }, []);

  const isReady = phase === 'ready';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.readerRoot}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header className={styles.readerHeader}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Kembali</button>

        <div className={styles.headerTitle}>
          <span className={styles.headerBook}>{bookTitle || '...'}</span>
        </div>

        {/* Toolbar EPUB */}
        {isReady && bookFormat === 'epub' && (
          <div className={styles.toolbar}>
            <button
              className={`${styles.toolBtn} ${epubSearchOpen ? styles.toolBtnActive : ''}`}
              onClick={() => {
                setEpubSearchOpen(v => !v);
                setTimeout(() => epubSearchInputRef.current?.focus(), 80);
              }}
              title="Cari teks (Ctrl+F)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <span className={styles.toolDivider} />
            <span className={styles.epubChapterLabel}>{epubChapter || 'Buku'}</span>
            <span className={styles.toolDivider} />
            <span className={styles.epubProgress}>{epubProgress}%</span>
            <span className={styles.toolDivider} />
            <button className={styles.pageNavBtn} onClick={epubPrev} disabled={epubAtStart} title="Bab sebelumnya (←)">‹</button>
            <button className={styles.pageNavBtn} onClick={epubNext} disabled={epubAtEnd}   title="Bab berikutnya (→)">›</button>
          </div>
        )}

        {/* Toolbar PDF */}
        {isReady && bookFormat === 'pdf' && (
          <div className={styles.toolbar}>
            <button
              className={`${styles.toolBtn} ${searchOpen ? styles.toolBtnActive : ''}`}
              onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 80); }}
              title="Cari teks (Ctrl+F)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <span className={styles.toolDivider} />
            <button className={styles.toolBtn} onClick={() => setZoomIdx(i => Math.max(i - 1, 0))} disabled={zoomIdx === 0} title="Perkecil (−)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <span className={styles.zoomLabel}>{ZOOM_LEVELS[zoomIdx].label}</span>
            <button className={styles.toolBtn} onClick={() => setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1} title="Perbesar (+)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <span className={styles.toolDivider} />
            <form onSubmit={handleJumpSubmit} className={styles.pageNav}>
              <button type="button" className={styles.pageNavBtn} onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1}>‹</button>
              <div className={styles.pageInputWrap}>
                <input
                  ref={jumpInputRef}
                  type="text"
                  inputMode="numeric"
                  className={styles.pageInput}
                  value={jumpInput}
                  onChange={e => setJumpInput(e.target.value.replace(/\D/g, ''))}
                  onFocus={e => e.target.select()}
                  aria-label="Nomor halaman"
                />
                <span className={styles.pageTotal}>/ {totalPages}</span>
              </div>
              <button type="button" className={styles.pageNavBtn} onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages}>›</button>
            </form>
          </div>
        )}
      </header>

      {/* ══ EPUB SEARCH BAR ═════════════════════════════════════════════════ */}
      {isReady && bookFormat === 'epub' && epubSearchOpen && (
        <div className={styles.searchBar}>
          <form onSubmit={handleEpubSearchSubmit} className={styles.searchForm}>
            <div className={styles.searchInputWrap}>
              <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={epubSearchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Cari dalam buku..."
                value={epubSearchQuery}
                onChange={e => setEpubSearchQuery(e.target.value)}
              />
              {epubSearchQuery && (
                <button type="button" className={styles.searchClear} onClick={clearEpubSearch}>✕</button>
              )}
            </div>

            <button type="submit" className={styles.searchSubmit} disabled={epubSearching || !epubSearchQuery.trim()}>
              {epubSearching ? 'Mencari...' : 'Cari'}
            </button>

            {epubSearchMarks.length > 0 && (
              <>
                <span className={styles.searchCount}>{epubSearchMarks.length} hasil</span>
                <button type="button" className={styles.searchNavBtn} onClick={() => jumpEpubMark(-1)}>‹</button>
                <span className={styles.searchHitPos}>{epubSearchMarkIdx + 1}/{epubSearchMarks.length}</span>
                <button type="button" className={styles.searchNavBtn} onClick={() => jumpEpubMark(1)}>›</button>
              </>
            )}
            {!epubSearching && epubSearchQuery && epubSearchMarks.length === 0 && (
              <span className={styles.searchNoResult}>Tidak ditemukan</span>
            )}
          </form>
          <button className={styles.searchClose} onClick={() => { setEpubSearchOpen(false); clearEpubSearch(); }}>✕</button>
        </div>
      )}

      {/* ══ PDF SEARCH BAR ══════════════════════════════════════════════════ */}
      {isReady && bookFormat === 'pdf' && searchOpen && (
        <div className={styles.searchBar}>
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <div className={styles.searchInputWrap}>
              <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Cari dalam dokumen..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(searchQuery); } }}
              />
              {searchQuery && (
                <button type="button" className={styles.searchClear} onClick={() => { setSearchQuery(''); setSearchHits([]); clearPdfHighlights(); }}>✕</button>
              )}
            </div>
            <button type="submit" className={styles.searchSubmit} disabled={searching || !searchQuery.trim()}>
              {searching ? 'Mencari...' : 'Cari'}
            </button>
            {searchHits.length > 0 && (
              <>
                <span className={styles.searchCount}>{totalMatches} hasil · halaman {searchHits[searchHitIdx].page}</span>
                <button type="button" className={styles.searchNavBtn} onClick={() => jumpSearchHit(-1)}>‹</button>
                <span className={styles.searchHitPos}>{searchHitIdx + 1}/{searchHits.length}</span>
                <button type="button" className={styles.searchNavBtn} onClick={() => jumpSearchHit(1)}>›</button>
              </>
            )}
            {!searching && searchQuery && searchHits.length === 0 && (
              <span className={styles.searchNoResult}>Tidak ditemukan</span>
            )}
          </form>
          <button className={styles.searchClose} onClick={() => setSearchOpen(false)}>✕</button>
        </div>
      )}

      {/* ══ PASSPHRASE MODAL ════════════════════════════════════════════════ */}
      {phase === 'passphrase' && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <p className={styles.modalLabel}>Verifikasi Akses</p>
              <h2 className={styles.modalTitle}>Masukkan Sandi</h2>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalHint}>
                {(lcpl?.encryption.user_key.text_hint ||
                  'Sandi yang Anda buat saat registrasi atau dapat diubah di menu Pengaturan akun.')
                  .replace(/—/g, ' ').replace(/--/g, ' ').trim()}
              </p>
              <form onSubmit={handleSubmitPassphrase} className={styles.passphraseForm}>
                <input
                  ref={passphraseInputRef}
                  type="password"
                  className={`form-input ${styles.passphraseInput}`}
                  placeholder="Sandi ITSPress Anda"
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="submit" className={`btn btn-primary ${styles.passphraseBtn}`} disabled={!passphrase.trim()}>
                  Buka Dokumen
                </button>
                <button type="button" className={`btn btn-ghost ${styles.passphraseBtn}`} onClick={() => router.back()}>
                  Batal
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══ LOADING ═════════════════════════════════════════════════════════ */}
      {(phase === 'loading-license' || phase === 'decrypting' || phase === 'rendering') && (
        <div className={styles.statusOverlay}>
          <div className={styles.statusBox}>
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <p className={styles.statusText}>
              {phase === 'loading-license' && 'Memuat lisensi...'}
              {(phase === 'decrypting' || phase === 'rendering') && statusMsg}
            </p>
            {phase === 'rendering' && bookFormat === 'pdf' && totalPages > 0 && (
              <p className={styles.statusSub}>Halaman {currentPage} / {totalPages}</p>
            )}
          </div>
        </div>
      )}

      {/* ══ ERROR ═══════════════════════════════════════════════════════════ */}
      {phase === 'error' && (
        <div className={styles.errorState}>
          <div className={styles.errorBox}>
            <p className={styles.errorTitle}>Tidak dapat membuka dokumen</p>
            <p className={styles.errorMsg}>{errorMsg}</p>
            <div className={styles.errorActions}>
              <button className="btn btn-primary" onClick={() => router.back()}>Kembali ke Dashboard</button>
              {errorMsg.includes('andi') && (
                <button className="btn btn-ghost" onClick={() => { setErrorMsg(''); setPassphrase(''); setPhase('passphrase'); }}>
                  Coba Lagi
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ VIEWER ══════════════════════════════════════════════════════════ */}
      <main className={`${styles.readerMain} ${bookFormat === 'epub' ? styles.readerMainEpub : ''}`}>
        <div
          ref={viewerRef}
          className={styles.viewer}
          style={{ display: bookFormat === 'epub' ? 'none' : undefined }}
        />
        <div
          ref={epubRef}
          className={styles.epubViewer}
          style={{ display: bookFormat === 'epub' ? undefined : 'none' }}
        />
      </main>

    </div>
  );
}
