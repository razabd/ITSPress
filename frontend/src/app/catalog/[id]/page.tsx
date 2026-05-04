'use client';

import { useState, useEffect, use } from 'react';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { Book, Transaction } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { formatLabel, formatBadgeClass } from '@/lib/format';

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { items: cartItems, refresh: refreshCart } = useCart();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [related, setRelated] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [owned, setOwned] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [bookRes, allRes] = await Promise.all([
          apiClient.get(`/books/${id}`),
          apiClient.get('/books'),
        ]);
        const b: Book = bookRes.data;
        setBook(b);
        // Rekomendasi: buku lain (bukan buku ini), acak, ambil 4
        const others: Book[] = (allRes.data || []).filter((x: Book) => x.ID !== b.ID);
        const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 4);
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
          <span className={`badge ${formatBadgeClass(book.format)} ${styles.formatBadge}`}>
            {formatLabel(book.format)}
          </span>
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
            {!book.lcp_content_id ? (
              <span className="badge badge-yellow" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
                Segera Hadir
              </span>
            ) : owned ? (
              <>
                <span className="badge badge-green" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
                  Sudah Dimiliki
                </span>
                <Link href="/dashboard" className="btn btn-sm" style={{ marginLeft: 10 }}>
                  Ke Dashboard →
                </Link>
              </>
            ) : inCart ? (
              <>
                <button className="btn btn-sm" disabled style={{ opacity: 0.6 }}>
                  Sudah di Keranjang
                </button>
                <Link href="/cart" className="btn btn-primary btn-sm" style={{ marginLeft: 10 }}>
                  Lihat Keranjang →
                </Link>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={addToCart}
                disabled={adding}
                style={{ minWidth: 200 }}
              >
                {adding ? <><span className="spinner" /> Menambahkan...</> : '🛒  Tambah ke Keranjang'}
              </button>
            )}
          </div>

          {/* Meta info */}
          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Format</span>
              <span className={styles.metaValue}>{formatLabel(book.format)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Penerbit</span>
              <span className={styles.metaValue}>{book.publisher?.full_name || book.publisher?.name || 'ITS Press'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Proteksi</span>
              <span className={styles.metaValue}>Readium LCP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rekomendasi */}
      {related.length > 0 && (
        <section className={styles.related}>
          <h2 className={styles.relatedTitle}>Buku Lainnya</h2>
          <div className={styles.relatedGrid}>
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
                    <span className={`badge ${formatBadgeClass(r.format)}`} style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.65rem' }}>
                      {formatLabel(r.format)}
                    </span>
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
