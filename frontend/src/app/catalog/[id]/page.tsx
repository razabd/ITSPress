'use client';

import { useState, useEffect, use, useRef } from 'react';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { Book, Transaction } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import PreviewModal from '@/components/PreviewModal';

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { items: cartItems, refresh: refreshCart } = useCart();
  const router = useRouter();

  const sliderRef = useRef<HTMLDivElement>(null);
  const sliderHoveredRef = useRef(false);
  const [sliderAtEnd, setSliderAtEnd] = useState(false);
  const [sliderAtStart, setSliderAtStart] = useState(true);
  const [book, setBook] = useState<Book | null>(null);
  const [related, setRelated] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [owned, setOwned] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [bookRes, allRes] = await Promise.all([
          apiClient.get(`/books/${id}`),
          apiClient.get('/books'),
        ]);
        const b: Book = bookRes.data;
        setBook(b);
        const others: Book[] = (allRes.data || []).filter((x: Book) => x.ID !== b.ID);
        const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 12);
        setRelated(shuffled);
      } catch {
        toast.error('Buku tidak ditemukan');
        router.push('/catalog');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, router]);

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const update = () => {
      setSliderAtStart(el.scrollLeft <= 0);
      setSliderAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    };
    const onWheel = (e: WheelEvent) => {
      if (!sliderHoveredRef.current || e.deltaY === 0) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY * 2, behavior: 'smooth' });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
    };
  }, [related]);

  useEffect(() => {
    if (!user || user.role !== 'pelanggan' || !book) return;
    apiClient.get('/transactions')
      .then(data => {
        const isOwned = (data.data || []).some(
          (tx: Transaction) => tx.status === 'success' && tx.book_id === book.ID
        );
        setOwned(isOwned);
      })
      .catch(() => {});
  }, [user, book]);

  const inCart = cartItems.some(ci => ci.book_id === book?.ID);

  const addToCart = async () => {
    if (!user) { router.push('/login'); return; }
    if (!book) return;
    setAdding(true);
    try {
      await apiClient.post('/cart', { book_id: book.ID });
      await refreshCart();
      toast.success('Buku ditambahkan ke keranjang!');
    } catch (err: unknown) {
      const msg = (err as { error?: string })?.error || 'Gagal menambah ke keranjang';
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.skeletonWrapper}>
        <div className={styles.skeletonLeft} />
        <div className={styles.skeletonRight}>
          <div className={styles.skeletonLine} style={{ width: '75%', height: 32 }} />
          <div className={styles.skeletonLine} style={{ width: '45%', height: 18, marginTop: 14 }} />
          <div className={styles.skeletonLine} style={{ width: '100%', height: 72, marginTop: 28 }} />
          <div className={styles.skeletonLine} style={{ width: '60%', height: 18, marginTop: 14 }} />
          <div className={styles.skeletonLine} style={{ width: '80%', height: 18, marginTop: 10 }} />
        </div>
      </div>
    );
  }

  if (!book) return null;

  const coverSrc = book.cover_url
    ? book.cover_url.startsWith('http')
      ? book.cover_url
      : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${book.cover_url}`
    : null;

  return (
    <div className={styles.pageWrap}>

      {/* Breadcrumb */}
      <div className="container">
        <nav className={styles.breadcrumb}>
          <Link href="/catalog">Katalog</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span className={styles.breadcrumbCurrent}>{book.title}</span>
        </nav>
      </div>

      {/* ── Main Detail — Split Section ── */}
      <div className={styles.detailWrapper}>
        <div className={styles.detailCard}>

          {/* Left: navy panel — cover + price + CTA */}
          <div className={styles.leftCol}>
            <div className={styles.coverWrap}>
              {coverSrc ? (
                <img src={coverSrc} alt={book.title} className={styles.coverImg} />
              ) : (
                <div className={styles.coverFallback}>
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </div>
              )}
            </div>

            <div className={styles.leftPrice}>
              <span className={styles.priceLabel}>Harga</span>
              <p className={styles.priceValue}>
                {book.price === 0 ? 'Gratis' : `Rp ${book.price.toLocaleString('id-ID')}`}
              </p>
            </div>

            <div className={styles.leftDivider} />

            <div className={styles.leftActions}>
              {book.is_withdrawn ? (
                <div className={styles.statusTag}>Tidak Tersedia</div>
              ) : !book.lcp_content_id ? (
                <div className={styles.statusTagSoon}>Segera Hadir</div>
              ) : owned ? (
                <>
                  <div className={styles.statusTagOwned}>Sudah Dimiliki</div>
                  <Link href="/dashboard" className={styles.btnOutlineWhite}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                    </svg>
                    Ke Dashboard
                  </Link>
                </>
              ) : inCart ? (
                <>
                  <div className={styles.statusTag}>Sudah di Keranjang</div>
                  <Link href="/cart" className={styles.btnWhite}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                    Lihat Keranjang
                  </Link>
                </>
              ) : (
                <button className={styles.btnWhite} onClick={addToCart} disabled={adding}>
                  {adding ? (
                    <><span className="spinner" /> Menambahkan...</>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                      Tambah ke Keranjang
                    </>
                  )}
                </button>
              )}

              {(book.preview_page_count ?? 0) > 0 && (
                <button className={styles.btnOutlineWhite} onClick={() => setShowPreview(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Preview Buku
                </button>
              )}
            </div>
          </div>

          {/* Right: white panel — title + info */}
          <div className={styles.rightCol}>
            <h1 className={styles.title}>{book.title}</h1>

            <p className={styles.authorLine}>
              <span className={styles.authorBy}>oleh</span>{' '}
              {book.author || '—'}
              {book.published_year && book.published_year > 0 ? (
                <><span className={styles.authorDot}>·</span>{book.published_year}</>
              ) : null}
            </p>

            <div className={styles.descriptionWrap}>
              <p className={styles.description}>
                {book.description || 'Tidak ada deskripsi untuk buku ini.'}
              </p>
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Penulis</span>
                <span className={styles.metaValue}>{book.author || '—'}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Tahun Terbit</span>
                <span className={styles.metaValue}>{book.published_year || '—'}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>ISBN</span>
                <span className={styles.metaValue}>{book.isbn || '—'}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Jumlah Halaman</span>
                <span className={styles.metaValue}>{book.page_count ? `${book.page_count} halaman` : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPreview && (
        <PreviewModal
          bookId={book.ID}
          pageCount={book.preview_page_count!}
          bookTitle={book.title}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── Related Books ── */}
      {related.length > 0 && (
        <section className={styles.related}>
          <div className="container">
            <div className={styles.relatedHeader}>
              <h2 className={styles.relatedTitle}>Buku Lainnya</h2>
              <div className={styles.sliderBtns}>
                <button
                  className={styles.sliderBtn}
                  onClick={() => sliderRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
                  disabled={sliderAtStart}
                  aria-label="Sebelumnya"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <button
                  className={styles.sliderBtn}
                  onClick={() => sliderRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
                  disabled={sliderAtEnd}
                  aria-label="Berikutnya"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={styles.relatedSlider} ref={sliderRef}>
              {related.map((r, i) => {
                const rCover = r.cover_url
                  ? r.cover_url.startsWith('http')
                    ? r.cover_url
                    : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${r.cover_url}`
                  : null;
                return (
                  <Link
                    href={`/catalog/${r.ID}`}
                    key={r.ID}
                    className={styles.relCard}
                    style={{ '--ri': i } as React.CSSProperties}
                    onMouseEnter={() => { sliderHoveredRef.current = true; }}
                    onMouseLeave={() => { sliderHoveredRef.current = false; }}
                  >
                    <div className={styles.relCover}>
                      {rCover ? (
                        <img src={rCover} alt={r.title} className={styles.relCoverImg} />
                      ) : (
                        <div className={styles.relCoverFallback}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className={styles.relInfo}>
                      <h4 className={styles.relTitle}>{r.title}</h4>
                      <p className={styles.relPrice}>
                        {r.price === 0 ? 'Gratis' : `Rp ${r.price.toLocaleString('id-ID')}`}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
