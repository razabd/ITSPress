'use client';

import { useState, useEffect } from 'react';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { Book, Transaction } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';

export default function CatalogPage() {
  const { user } = useAuth();
  const { items: cartItems, refresh: refreshCart } = useCart();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);
  const [ownedBookIds, setOwnedBookIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient.get('/books')
      .then(data => setBooks(data.data || []))
      .catch(() => toast.error('Gagal memuat katalog'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === 'pelanggan') {
      apiClient.get('/transactions')
        .then(data => {
          const owned = new Set<number>(
            (data.data || [])
              .filter((tx: Transaction) => tx.status === 'success')
              .map((tx: Transaction) => tx.book_id)
          );
          setOwnedBookIds(owned);
        })
        .catch(() => {});
    } else {
      setOwnedBookIds(new Set());
    }
  }, [user]);

  const addToCart = async (bookId: number) => {
    if (!user) { router.push('/login'); return; }
    setAdding(bookId);
    try {
      await apiClient.post('/cart', { book_id: bookId });
      await refreshCart();
      toast.success('Buku ditambahkan ke keranjang!');
    } catch (err: unknown) {
      const msg = (err as { error?: string })?.error || 'Gagal menambah ke keranjang';
      if (msg === 'Buku sudah ada di keranjang') {
        toast('Buku sudah ada di keranjang', { icon: '🛒' });
      } else {
        toast.error(msg);
      }
    } finally {
      setAdding(null);
    }
  };

  const inCartIds = new Set(cartItems.map(ci => ci.book_id));
  const filtered = books.filter(b =>
    b.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.pageWrap}>

      {/* ── Hero Header ── */}
      <section className={styles.catalogHero}>
        <div className={styles.heroGridOverlay} />
        <div className={styles.heroGlow} />
        <div className="container">
          <div className={styles.heroInner}>
            <h1 className={styles.heroTitle}>Katalog E-book</h1>
            <p className={styles.heroSub}>Temukan koleksi buku digital terbitan ITS Press.</p>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Cari judul buku..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Content ── */}
      <div className={`container ${styles.main}`}>
        {loading ? (
          <div className={styles.loadingGrid}>
            {[...Array(8)].map((_, i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>
              {search ? 'Buku tidak ditemukan' : 'Belum ada buku tersedia'}
            </h3>
            <p className={styles.emptySub}>
              {search ? `Tidak ada hasil untuk "${search}"` : 'Katalog masih kosong. Silakan cek kembali nanti.'}
            </p>
          </div>
        ) : (
          <>
            <div className={styles.resultsMeta}>
              <span className={styles.resultsCount}>{filtered.length} judul buku</span>
            </div>
            <div className={styles.grid}>
              {filtered.map((book, i) => (
                <div
                  key={book.ID}
                  className={styles.bookItem}
                  style={{ '--i': Math.min(i, 14) } as React.CSSProperties}
                >
                  {/* Cover */}
                  <div className={styles.coverWrap}>
                    <Link href={`/catalog/${book.ID}`} className={styles.coverLink}>
                      {book.cover_url ? (
                        <img
                          src={book.cover_url.startsWith('http') ? book.cover_url : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${book.cover_url}`}
                          alt={book.title}
                          className={styles.cover}
                        />
                      ) : (
                        <div className={styles.coverPlaceholder}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                          </svg>
                        </div>
                      )}
                    </Link>

                    {/* Badges */}
                    {!book.lcp_content_id && (
                      <span className={`${styles.coverBadge} ${styles.coverBadgeSoon}`}>
                        Segera Hadir
                      </span>
                    )}
                    {ownedBookIds.has(book.ID) && (
                      <span className={`${styles.coverBadge} ${styles.coverBadgeOwned}`}>
                        Dimiliki
                      </span>
                    )}

                    {/* Hover overlay */}
                    <div className={styles.coverOverlay}>
                      {!book.lcp_content_id ? (
                        <span className={styles.overlaySoon}>Segera Hadir</span>
                      ) : ownedBookIds.has(book.ID) ? (
                        <Link href={`/dashboard`} className={styles.overlayBtnOwned}>
                          Baca Sekarang
                        </Link>
                      ) : inCartIds.has(book.ID) ? (
                        <span className={styles.overlayInCart}>✓ Di Keranjang</span>
                      ) : (
                        <button
                          className={styles.overlayBtn}
                          onClick={() => addToCart(book.ID)}
                          disabled={adding === book.ID}
                        >
                          {adding === book.ID ? <span className="spinner" /> : '+ Keranjang'}
                        </button>
                      )}
                      <Link href={`/catalog/${book.ID}`} className={styles.overlayDetailLink}>
                        Lihat Detail →
                      </Link>
                    </div>
                  </div>

                  {/* Meta — title + price row with mobile action */}
                  <div className={styles.bookMeta}>
                    <Link href={`/catalog/${book.ID}`} className={styles.titleLink}>
                      <h3 className={styles.bookTitle}>{book.title}</h3>
                    </Link>
                    <div className={styles.priceRow}>
                      <span className={book.price === 0 ? `${styles.price} ${styles.priceFree}` : styles.price}>
                        {book.price === 0 ? 'Gratis' : `Rp ${book.price.toLocaleString('id-ID')}`}
                      </span>
                      {book.lcp_content_id && (
                        <span className={styles.mobileAction}>
                          {ownedBookIds.has(book.ID) ? (
                            <Link href={`/catalog/${book.ID}`} className={styles.mobileActionOwned}>Baca</Link>
                          ) : inCartIds.has(book.ID) ? (
                            <span className={styles.mobileActionInCart}>✓</span>
                          ) : (
                            <button
                              className={styles.mobileActionBtn}
                              onClick={() => addToCart(book.ID)}
                              disabled={adding === book.ID}
                            >
                              {adding === book.ID ? '…' : '+'}
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
