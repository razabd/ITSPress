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
import { formatLabel, formatBadgeClass } from '@/lib/format';
import PreviewModal from '@/components/PreviewModal';

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { items: cartItems, refresh: refreshCart } = useCart();
  const router = useRouter();

  const sliderRef = useRef<HTMLDivElement>(null);
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
        // Rekomendasi: buku lain (bukan buku ini), acak, ambil maks 12
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
      if (e.deltaY === 0) return;
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
      <div className="container">
        <div className={styles.skeleton} />
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
    <div className="container">
      {/* Breadcrumb */}
      <nav className={styles.breadcrumb}>
        <Link href="/catalog">Katalog</Link>
        <span>›</span>
        <span>{book.title}</span>
      </nav>

      {/* Detail utama */}
      <div className={styles.detail}>
        {/* Cover */}
        <div className={styles.coverWrap}>
          {coverSrc ? (
            <img src={coverSrc} alt={book.title} className={styles.coverImg} />
          ) : (
            <div className={styles.coverFallback}>📚</div>
          )}
        </div>

        {/* Info */}
        <div className={styles.info}>
          <p className={styles.publisherLabel}>
            {book.publisher?.full_name || book.publisher?.name || 'ITS Press'}
          </p>
          <h1 className={styles.title}>{book.title}</h1>

          <p className={styles.description}>
            {book.description || 'Tidak ada deskripsi untuk buku ini.'}
          </p>

          <div className={styles.priceLine}>
            <span className={styles.price}>
              {book.price === 0 ? 'Gratis' : `Rp ${book.price.toLocaleString('id-ID')}`}
            </span>
          </div>

          {/* Action button */}
          <div className={styles.actions}>
            {(book.preview_page_count ?? 0) > 0 && (
              <button
                className="btn btn-outline"
                onClick={() => setShowPreview(true)}
                style={{ minWidth: 200 }}
              >
                Preview Buku
              </button>
            )}
            {book.is_withdrawn ? (
              <span className="badge badge-gray" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
                Tidak Tersedia
              </span>
            ) : !book.lcp_content_id ? (
              <span className="badge badge-yellow" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
                Segera Hadir
              </span>
            ) : owned ? (
              <div className={styles.actionRow}>
                <span className="badge badge-green" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
                  Sudah Dimiliki
                </span>
                <Link href="/dashboard" className="btn btn-outline btn-sm">
                  Ke Dashboard
                </Link>
              </div>
            ) : inCart ? (
              <div className={styles.actionRow}>
                <button className="btn btn-ghost btn-sm" disabled>
                  Sudah di Keranjang
                </button>
                <Link href="/cart" className="btn btn-primary btn-sm">
                  Lihat Keranjang →
                </Link>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={addToCart}
                disabled={adding}
                style={{ minWidth: 200 }}
              >
                {adding ? <><span className="spinner" /> Menambahkan...</> : 'Tambah ke Keranjang'}
              </button>
            )}
          </div>

          {/* Meta info */}
          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Penerbit</span>
              <span className={styles.metaValue}>{book.publisher?.full_name || book.publisher?.name || 'ITS Press'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Ketersediaan</span>
              <span className={styles.metaValue} style={{
                color: book.is_withdrawn ? 'var(--text-muted)' : book.lcp_content_id ? 'var(--success)' : 'var(--warning)'
              }}>
                {book.is_withdrawn ? 'Tidak Tersedia' : book.lcp_content_id ? 'Tersedia' : 'Segera Hadir'}
              </span>
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

      {/* Rekomendasi */}
      {related.length > 0 && (
        <section className={styles.related}>
          <div className={styles.relatedHeader}>
            <h2 className={styles.relatedTitle}>Buku Lainnya</h2>
            <div className={styles.sliderBtns}>
              <button
                className={styles.sliderBtn}
                onClick={() => sliderRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
                disabled={sliderAtStart}
                aria-label="Sebelumnya"
              >
                ‹
              </button>
              <button
                className={styles.sliderBtn}
                onClick={() => sliderRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                disabled={sliderAtEnd}
                aria-label="Berikutnya"
              >
                ›
              </button>
            </div>
          </div>
          <div className={styles.relatedSlider} ref={sliderRef}>
            {related.map(r => {
              const rCover = r.cover_url
                ? r.cover_url.startsWith('http') ? r.cover_url : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${r.cover_url}`
                : null;
              return (
                <Link href={`/catalog/${r.ID}`} key={r.ID} className={`card ${styles.relCard}`}>
                  <div className={styles.relCover}>
                    {rCover
                      ? <img src={rCover} alt={r.title} className={styles.relCoverImg} />
                      : <div className={styles.relCoverFallback}>📚</div>
                    }
                  </div>
                  <div className={styles.relInfo}>
                    <h4 className={styles.relTitle}>{r.title}</h4>
                    <p className={styles.relPublisher}>{r.publisher?.full_name || r.publisher?.name || 'ITS Press'}</p>
                    <p className={styles.relPrice}>
                      {r.price === 0 ? 'Gratis' : `Rp ${r.price.toLocaleString('id-ID')}`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
