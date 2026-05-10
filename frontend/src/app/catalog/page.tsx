'use client';

import { useState, useEffect } from 'react';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { Book, Transaction } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useLang } from '@/context/LangContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { formatLabel, formatBadgeClass } from '@/lib/format';

export default function CatalogPage() {
  const { user } = useAuth();
  const { items: cartItems, refresh: refreshCart } = useCart();
  const { t } = useLang();
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
    <div className="container">
      <div className="page-header">
        <h1>{t('catalog.title')}</h1>
        <p>{t('catalog.subtitle')}</p>
      </div>

      <div className={styles.searchWrap}>
        <input
          type="search"
          className="form-input"
          placeholder="Cari judul buku..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className={styles.loadingGrid}>
          {[...Array(6)].map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{search ? 'Buku tidak ditemukan' : t('catalog.emptyTitle')}</h3>
          <p>{search ? `Tidak ada hasil untuk "${search}"` : t('catalog.emptySub')}</p>
        </div>
      ) : (
        <div className={`grid-3 ${styles.grid}`}>
          {filtered.map(book => (
            <div key={book.ID} className={`card ${styles.bookCard}`}>
              <Link href={`/catalog/${book.ID}`} className={styles.coverLink}>
                <div className={styles.coverArea}>
                  {book.cover_url ? (
                    <img
                      src={book.cover_url.startsWith('http') ? book.cover_url : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${book.cover_url}`}
                      alt={book.title}
                      className={styles.cover}
                    />
                  ) : (
                    <div className={styles.coverPlaceholder}>📚</div>
                  )}
                </div>
              </Link>
              <div className={styles.bookInfo}>
                <Link href={`/catalog/${book.ID}`} className={styles.titleLink}>
                  <h3 className={styles.bookTitle}>{book.title}</h3>
                </Link>
                <p className={styles.bookDesc}>{book.description || 'Tidak ada deskripsi'}</p>
                <p className={styles.publisher}>
                  {t('catalog.by')} {book.publisher?.full_name || book.publisher?.name || 'ITS Press'}
                </p>
              </div>
              <div className={styles.bookFooter}>
                <span className={styles.price}>
                  {book.price === 0 ? t('catalog.free') : `Rp ${book.price.toLocaleString('id-ID')}`}
                </span>
                {!book.lcp_content_id ? (
                  <span className="badge badge-yellow">{t('catalog.comingSoon')}</span>
                ) : ownedBookIds.has(book.ID) ? (
                  <span className="badge badge-green">Sudah Dimiliki</span>
                ) : inCartIds.has(book.ID) ? (
                  <button className="btn btn-sm" disabled style={{ opacity: 0.6, cursor: 'default' }}>
                    Sudah di Keranjang
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => addToCart(book.ID)}
                    disabled={adding === book.ID}
                  >
                    {adding === book.ID ? <span className="spinner" /> : '+ Keranjang'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
