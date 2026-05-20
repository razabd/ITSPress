'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { Book } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import toast from 'react-hot-toast';
import styles from '../../dashboard/page.module.css';
import pubStyles from './publisher.module.css';
import { formatLabel } from '@/lib/format';
import ConfirmModal from '@/components/ConfirmModal';

type Tab = 'statistik' | 'buku' | 'upload';

interface EditState {
  open: boolean;
  book: Book | null;
  title: string;
  description: string;
  price: string;
  author: string;
  published_year: string;
  isbn: string;
  page_count: string;
  replaceFile: boolean;
  loading: boolean;
}

interface BookStat {
  id: number;
  title: string;
  format: string;
  price: number;
  is_withdrawn: boolean;
  lcp_content_id: string;
  purchase_count: number;
  revenue: number;
}

interface StatsData {
  summary: {
    total_books: number;
    published_books: number;
    total_purchases: number;
    total_revenue: number;
  };
  books: BookStat[];
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'statistik', label: 'Statistik' },
  { id: 'buku',      label: 'Buku Saya' },
  { id: 'upload',    label: 'Upload Buku' },
];

function fmtHeroRev(r: number): string {
  if (r === 0) return '—';
  if (r >= 1_000_000_000) return `Rp ${(r / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}M`;
  if (r >= 1_000_000)     return `Rp ${(r / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt`;
  return `Rp ${r.toLocaleString('id-ID')}`;
}

export default function PublisherDashboardPage() {
  return (
    <Suspense fallback={<div className="container" style={{ paddingTop: 80, textAlign: 'center' }}><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>}>
      <PublisherDashboardContent />
    </Suspense>
  );
}

function PublisherDashboardContent() {
  const { user, isLoading } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [myBooks, setMyBooks] = useState<Book[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: '', description: '', format: 'epub', price: '0', author: '', published_year: '', isbn: '', page_count: '' });
  const backendBase = API_BASE_URL.replace(/\/api\/v1$/, '');

  const rawTab = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = rawTab && TABS.some(t => t.id === rawTab) ? rawTab : 'statistik';

  const setTab = (tab: Tab) => router.push(`?tab=${tab}`, { scroll: false });

  const editFileRef = useRef<HTMLInputElement>(null);
  const editCoverRef = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<EditState>({
    open: false, book: null, title: '', description: '', price: '0',
    author: '', published_year: '', isbn: '', page_count: '',
    replaceFile: false, loading: false,
  });

  const [withdrawModal, setWithdrawModal] = useState<{ open: boolean; book: Book | null; loading: boolean }>({
    open: false, book: null, loading: false,
  });
  const [relistModal, setRelistModal] = useState<{ open: boolean; book: Book | null; loading: boolean }>({
    open: false, book: null, loading: false,
  });

  const [stats, setStats] = useState<StatsData | null>(null);
  const [bookSearch, setBookSearch] = useState('');

  const reloadAll = async () => {
    const [booksRes] = await Promise.all([
      apiClient.get('/books/my'),
      apiClient.get('/books/my/stats').then(d => setStats(d as StatsData)).catch(() => {}),
    ]);
    setMyBooks(booksRes.data || []);
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'publisher') { router.replace('/login'); return; }
    Promise.all([
      apiClient.get('/books/my').then(d => setMyBooks(d.data || [])),
      apiClient.get('/books/my/stats').then(d => setStats(d as StatsData)).catch(() => {}),
    ]).finally(() => setLoadingData(false));
  }, [user, isLoading, router]);

  useEffect(() => {
    const hasEncrypting = myBooks.some(b => !b.lcp_content_id && !b.is_withdrawn);
    if (!hasEncrypting) return;
    const id = setInterval(async () => {
      try {
        const res = await apiClient.get('/books/my');
        setMyBooks(res.data || []);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [myBooks]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) { toast.error('Pilih file e-book terlebih dahulu'); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', fileRef.current.files[0]);
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('format', form.format);
    fd.append('price', form.price);
    fd.append('author', form.author);
    fd.append('published_year', form.published_year);
    fd.append('isbn', form.isbn);
    fd.append('page_count', form.page_count);
    if (coverRef.current?.files?.[0]) fd.append('cover', coverRef.current.files[0]);
    try {
      await apiClient.postForm('/books', fd);
      toast.success('E-book berhasil diunggah!');
      setForm({ title: '', description: '', format: 'epub', price: '0', author: '', published_year: '', isbn: '', page_count: '' });
      if (fileRef.current) fileRef.current.value = '';
      if (coverRef.current) coverRef.current.value = '';
      await reloadAll();
      setTab('buku');
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Upload gagal');
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (book: Book) =>
    setEdit({
      open: true, book,
      title: book.title,
      description: book.description ?? '',
      price: String(book.price ?? 0),
      author: book.author ?? '',
      published_year: book.published_year ? String(book.published_year) : '',
      isbn: book.isbn ?? '',
      page_count: book.page_count ? String(book.page_count) : '',
      replaceFile: false, loading: false,
    });
  const closeEdit = () => setEdit(s => ({ ...s, open: false, loading: false }));

  const handleSaveEdit = async () => {
    if (!edit.book) return;
    if (!edit.title.trim()) { toast.error('Judul tidak boleh kosong'); return; }
    setEdit(s => ({ ...s, loading: true }));
    const fd = new FormData();
    fd.append('title', edit.title.trim());
    fd.append('description', edit.description);
    fd.append('price', edit.price);
    fd.append('author', edit.author);
    fd.append('published_year', edit.published_year);
    fd.append('isbn', edit.isbn);
    fd.append('page_count', edit.page_count);
    if (editCoverRef.current?.files?.[0]) fd.append('cover', editCoverRef.current.files[0]);
    if (edit.replaceFile && editFileRef.current?.files?.[0]) fd.append('file', editFileRef.current.files[0]);
    try {
      await apiClient.putForm(`/books/${edit.book.ID}`, fd);
      toast.success('Perubahan berhasil disimpan.');
      closeEdit();
      await reloadAll();
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal menyimpan perubahan');
    } finally {
      setEdit(s => ({ ...s, loading: false }));
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawModal.book) return;
    setWithdrawModal(s => ({ ...s, loading: true }));
    try {
      await apiClient.post(`/books/${withdrawModal.book.ID}/withdraw`, {});
      toast.success('Buku berhasil ditarik dari katalog.');
      setWithdrawModal({ open: false, book: null, loading: false });
      await reloadAll();
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal menarik buku');
      setWithdrawModal(s => ({ ...s, loading: false }));
    }
  };

  const handleRelist = async () => {
    if (!relistModal.book) return;
    setRelistModal(s => ({ ...s, loading: true }));
    try {
      await apiClient.post(`/books/${relistModal.book.ID}/relist`, {});
      toast.success('Buku diajukan ulang untuk persetujuan admin.');
      setRelistModal({ open: false, book: null, loading: false });
      await reloadAll();
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal mendaftarkan ulang buku');
      setRelistModal(s => ({ ...s, loading: false }));
    }
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 16px', fontWeight: 600, fontSize: '0.75rem',
    color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = { padding: '11px 16px', verticalAlign: 'middle' };

  if (isLoading || loadingData) return (
    <div className="container"><div className={styles.loading}><span className="spinner" /></div></div>
  );

  return (
    <>
      {/* ── Publisher Hero ── */}
      <div className={pubStyles.pubHero}>
        <div className={pubStyles.pubHeroOverlay} />
        <div className={pubStyles.pubHeroGlow} />
        <div className="container">
          <div className={pubStyles.pubHeroInner}>
            <div>
              <p className={pubStyles.pubGreetLabel}>{t('publisher.title')}</p>
              <h1 className={pubStyles.pubGreetName}>
                {t('publisher.subtitle')} <strong>{user?.name}</strong>
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="container">

        {/* Tab navigation — underline style */}
        <nav className={pubStyles.tabNav}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${pubStyles.tabBtn} ${activeTab === tab.id ? pubStyles.tabBtnActive : ''}`}
              onClick={() => setTab(tab.id)}
            >
              {tab.label}
              {tab.id === 'buku' && myBooks.length > 0 && (
                <span className={pubStyles.tabCount}>{myBooks.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* ── TAB: Statistik ── */}
        {activeTab === 'statistik' && (
          <div className={pubStyles.tabContent}>
            {!stats || stats.summary.total_books === 0 ? (
              <div className="empty-state">
                <h3>Belum ada data statistik</h3>
                <p>Mulai dengan mengunggah buku pertama Anda.</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setTab('upload')}>
                  Upload Buku
                </button>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className={pubStyles.statsGrid}>
                  {[
                    { label: 'Total Buku',       display: stats.summary.total_books.toLocaleString('id-ID'),     color: 'var(--its-navy)',     dot: 'var(--its-navy)',     small: false },
                    { label: 'Aktif di Katalog', display: stats.summary.published_books.toLocaleString('id-ID'), color: 'var(--success)',      dot: 'var(--success)',      small: false },
                    { label: 'Total Pembelian',  display: stats.summary.total_purchases.toLocaleString('id-ID'), color: 'var(--its-navy-mid)', dot: 'var(--its-navy-mid)', small: false },
                    { label: 'Total Pendapatan', display: fmtHeroRev(stats.summary.total_revenue),               color: stats.summary.total_revenue > 0 ? 'var(--success)' : 'var(--text-muted)', dot: 'var(--success)', small: true },
                  ].map(item => (
                    <div key={item.label} className={pubStyles.statCard}>
                      <div className={pubStyles.statLabel}>
                        <span className={pubStyles.statDot} style={{ background: item.dot }} />
                        {item.label}
                      </div>
                      <div
                        className={`${pubStyles.statValue}${item.small ? ` ${pubStyles.statValueSm}` : ''}`}
                        style={{ color: item.color }}
                      >
                        {item.display}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Per-book table */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Rincian per Buku
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {stats.books.length} buku
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                          <th style={thStyle}>Judul Buku</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Harga</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>Terjual</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Pendapatan</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.books.map((b, i) => {
                          const isLast = i === stats.books.length - 1;
                          const isAvailable = !!b.lcp_content_id && !b.is_withdrawn;
                          const statusLabel =
                            b.is_withdrawn ? 'Ditarik'     :
                            isAvailable    ? 'Aktif'       :
                                            'Enkripsi...';
                          const statusColor =
                            b.is_withdrawn ? 'var(--text-muted)' :
                            isAvailable    ? 'var(--success)'    :
                                            'var(--its-navy)';
                          return (
                            <tr key={b.id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                              <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)', maxWidth: 220 }}>{b.title}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)' }}>
                                {b.price === 0 ? 'Gratis' : `Rp ${b.price.toLocaleString('id-ID')}`}
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: b.purchase_count > 0 ? 'var(--its-navy)' : 'var(--text-muted)' }}>
                                {b.purchase_count.toLocaleString('id-ID')}
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: b.revenue > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                                {b.revenue === 0 ? '—' : `Rp ${b.revenue.toLocaleString('id-ID')}`}
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'center' }}>
                                <span style={{ color: statusColor, fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                  {statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: Buku Saya ── */}
        {activeTab === 'buku' && (
          <div className={pubStyles.tabContent}>
            {myBooks.length === 0 ? (
              <div className="empty-state">
                <h3>{t('publisher.emptyTitle')}</h3>
                <p>{t('publisher.emptySub')}</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setTab('upload')}>
                  Upload Buku Pertama
                </button>
              </div>
            ) : (
              <>
                {/* Search bar */}
                <div className={pubStyles.bookSearchBar}>
                  <div className={pubStyles.bookSearchWrap}>
                    <svg className={pubStyles.bookSearchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
                      <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      className={pubStyles.bookSearchInput}
                      placeholder="Cari judul atau penulis…"
                      value={bookSearch}
                      onChange={e => setBookSearch(e.target.value)}
                    />
                    {bookSearch && (
                      <button
                        className={pubStyles.bookSearchClear}
                        onClick={() => setBookSearch('')}
                        aria-label="Hapus pencarian"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {(() => {
                  const q = bookSearch.toLowerCase();
                  const filtered = q
                    ? myBooks.filter(b =>
                        b.title.toLowerCase().includes(q) ||
                        (b.author ?? '').toLowerCase().includes(q)
                      )
                    : myBooks;
                  if (filtered.length === 0) return (
                    <div className="empty-state" style={{ paddingTop: 48 }}>
                      <h3>Tidak ada hasil</h3>
                      <p>Tidak ada buku yang cocok dengan &ldquo;{bookSearch}&rdquo;.</p>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setBookSearch('')}>
                        Hapus Pencarian
                      </button>
                    </div>
                  );
                  return (
              <div className={styles.list}>
                {filtered.map(book => {
                  const isEncrypted = !!book.lcp_content_id;
                  const isWithdrawn = !!book.is_withdrawn;
                  const isAvailableInCatalog = isEncrypted && !isWithdrawn;

                  const dotColor =
                    isWithdrawn ? 'var(--text-muted)' :
                    isEncrypted ? 'var(--success)'    :
                                  'var(--its-navy)';
                  const statusLabel =
                    isWithdrawn ? 'Ditarik dari Katalog' :
                    isEncrypted ? 'Tersedia di Katalog'  :
                                  'Sedang Dienkripsi...';

                  return (
                    <div key={book.ID} className={`card ${styles.itemCard} ${isEncrypted && !isWithdrawn ? styles.itemCardActive : styles.itemCardPending}`}>
                      {book.cover_url ? (
                        <img
                          src={`${backendBase}${book.cover_url}`}
                          alt={book.title}
                          className={styles.itemCoverImg}
                        />
                      ) : (
                        <div className={styles.itemCoverPlaceholder} />
                      )}
                      <div className={styles.itemInfo} style={{ flex: 1 }}>
                        <p className={styles.itemTitle}>{book.title}</p>
                        <p className={styles.itemMeta}>
                          {formatLabel(book.format)} · {book.price === 0 ? t('publisher.free') : `Rp ${book.price.toLocaleString('id-ID')}`}
                          <span className={styles.statusDot} style={{ background: dotColor }} />
                          <span className={styles.statusText} style={{ color: dotColor }}>{statusLabel}</span>
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEdit(book)}
                          >
                            Edit
                          </button>
                          {isAvailableInCatalog && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              onClick={() => setWithdrawModal({ open: true, book, loading: false })}
                            >
                              Tarik dari Katalog
                            </button>
                          )}
                          {isWithdrawn && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--success)', borderColor: 'var(--success)' }}
                              onClick={() => setRelistModal({ open: true, book, loading: false })}
                            >
                              Daftarkan Ulang
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ── TAB: Upload Buku ── */}
        {activeTab === 'upload' && (
          <div className={pubStyles.tabContent}>
            <div className="card">
              <form onSubmit={handleUpload} className={styles.uploadForm}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">{t('publisher.form.titleLabel')}</label>
                    <input type="text" className="form-input" placeholder={t('publisher.form.titlePh')}
                      value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('publisher.form.format')}</label>
                    <select className="form-input" value={form.format}
                      onChange={e => setForm({ ...form, format: e.target.value })}>
                      <option value="epub">EPUB</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('publisher.form.desc')}</label>
                  <textarea className="form-input" rows={3} placeholder={t('publisher.form.descPh')}
                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Penulis <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="text" className="form-input" placeholder="Nama penulis"
                      value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tahun Terbit <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="number" className="form-input" placeholder="Contoh: 2024"
                      value={form.published_year} onChange={e => setForm({ ...form, published_year: e.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">ISBN <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="text" className="form-input" placeholder="978-..."
                      value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Jumlah Halaman <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="number" className="form-input" placeholder="Contoh: 320"
                      value={form.page_count} onChange={e => setForm({ ...form, page_count: e.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">{t('publisher.form.price')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      placeholder="Rp 0"
                      value={form.price && form.price !== '0' ? `Rp ${Number(form.price).toLocaleString('id-ID')}` : ''}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setForm({ ...form, price: digits || '0' });
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('publisher.form.file')}</label>
                    <input type="file" accept=".epub,.pdf" className="form-input" ref={fileRef} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {t('publisher.form.cover')}{' '}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('publisher.form.coverOpt')}</span>
                  </label>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" className="form-input" ref={coverRef} />
                  {form.format === 'pdf' && (
                    <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4 }}>{t('publisher.form.coverNote')}</p>
                  )}
                </div>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? <><span className="spinner" /> {t('publisher.form.uploading')}</> : t('publisher.form.uploadBtn')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Edit Modal ── */}
        {edit.open && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, animation: 'fadeIn 0.15s ease' }}
            onClick={closeEdit}
          >
            <div
              style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'slideUp 0.18s ease' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--its-navy)' }}>Edit Buku</h3>
                <button onClick={closeEdit} disabled={edit.loading} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)', lineHeight: 1, padding: 4 }}>
                  ✕
                </button>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Judul</label>
                  <input type="text" className="form-input" value={edit.title}
                    onChange={e => setEdit(s => ({ ...s, title: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Deskripsi <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                  <textarea className="form-input" rows={4} style={{ resize: 'vertical' }} value={edit.description}
                    onChange={e => setEdit(s => ({ ...s, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(0 untuk gratis)</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-input"
                    placeholder="Rp 0"
                    value={edit.price && edit.price !== '0' ? `Rp ${Number(edit.price).toLocaleString('id-ID')}` : ''}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setEdit(s => ({ ...s, price: digits || '0' }));
                    }}
                  />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Penulis <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="text" className="form-input" placeholder="Nama penulis"
                      value={edit.author} onChange={e => setEdit(s => ({ ...s, author: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tahun Terbit <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="number" className="form-input" placeholder="Contoh: 2024"
                      value={edit.published_year} onChange={e => setEdit(s => ({ ...s, published_year: e.target.value }))} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">ISBN <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="text" className="form-input" placeholder="978-..."
                      value={edit.isbn} onChange={e => setEdit(s => ({ ...s, isbn: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Jumlah Halaman <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                    <input type="number" className="form-input" placeholder="Contoh: 320"
                      value={edit.page_count} onChange={e => setEdit(s => ({ ...s, page_count: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Ganti Cover <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" className="form-input" ref={editCoverRef} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${edit.replaceFile ? 'var(--its-navy)' : 'var(--border)'}`, background: edit.replaceFile ? 'var(--its-navy-pale)' : 'var(--white)', transition: 'all 0.15s' }}>
                  <input type="checkbox" checked={edit.replaceFile}
                    onChange={e => setEdit(s => ({ ...s, replaceFile: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--its-navy)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Ganti file buku (perbarui ke versi terbaru)
                  </span>
                </label>
                {edit.replaceFile && (
                  <div className="form-group">
                    <label className="form-label">File Buku Baru</label>
                    <input type="file" accept=".epub,.pdf" className="form-input" ref={editFileRef} />
                  </div>
                )}
                {edit.replaceFile && (
                  <div className="alert alert-warning" style={{ fontSize: '0.82rem' }}>
                    Mengganti file buku akan memicu enkripsi ulang — buku sementara tidak tersedia di katalog selama proses berlangsung.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px 20px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost" onClick={closeEdit} disabled={edit.loading}>Batal</button>
                <button className="btn btn-primary" onClick={handleSaveEdit} disabled={edit.loading}>
                  {edit.loading ? <><span className="spinner" /> Menyimpan...</> : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm Modals ── */}
        <ConfirmModal
          open={withdrawModal.open}
          title="Tarik Buku dari Katalog?"
          message={`Buku "${withdrawModal.book?.title}" akan langsung disembunyikan dari katalog. Anda dapat mendaftarkan ulang kapan saja.`}
          confirmLabel="Tarik dari Katalog"
          danger loading={withdrawModal.loading}
          onConfirm={handleWithdraw}
          onCancel={() => setWithdrawModal({ open: false, book: null, loading: false })}
        />
        <ConfirmModal
          open={relistModal.open}
          title="Daftarkan Ulang Buku?"
          message={`Buku "${relistModal.book?.title}" akan langsung didaftarkan kembali dan muncul di katalog.`}
          confirmLabel="Ya, Daftarkan Ulang"
          loading={relistModal.loading}
          onConfirm={handleRelist}
          onCancel={() => setRelistModal({ open: false, book: null, loading: false })}
        />
      </div>
    </>
  );
}
