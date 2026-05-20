'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL, apiClient } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function CartPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { items, refresh: refreshCart, clear: clearCart } = useCart();
  const router = useRouter();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  const total = items.reduce((sum, item) => sum + (item.book?.price ?? 0), 0);

  const formatPrice = (price: number) =>
    price === 0 ? 'Gratis' : `Rp ${price.toLocaleString('id-ID')}`;

  const removeItem = async (bookId: number) => {
    setRemovingId(bookId);
    try {
      await apiClient.delete(`/cart/${bookId}`);
      await sleep(500);
      await refreshCart();
    } catch {
      toast.error('Gagal menghapus item');
    } finally {
      setRemovingId(null);
    }
  };

  const checkout = async () => {
    setCheckingOut(true);
    await sleep(500);
    try {
      const res = await apiClient.post('/cart/checkout', {});

      if (res.status === 'success') {
        clearCart();
        toast.success('Checkout berhasil! Aktifkan lisensi di dashboard.');
        router.push('/dashboard');
        return;
      }

      // Cart sudah dihapus di backend saat checkout — bersihkan state lokal sekarang
      clearCart();

      if (res.snap_token && typeof window !== 'undefined' && window.snap) {
        try {
          window.snap.pay(res.snap_token, {
            onSuccess: () => {
              toast.success('Pembayaran berhasil! Aktifkan lisensi di dashboard.');
              router.push('/dashboard');
            },
            onPending: () => {
              toast('Pembayaran sedang diproses. Cek status di dashboard.', { icon: '⏳' });
              router.push('/dashboard');
            },
            onError: () => toast.error('Pembayaran gagal. Silakan coba lagi.'),
            onClose: () => {
              toast('Pembayaran dibatalkan. Transaksi tersimpan di dashboard.', { icon: '⚠️' });
              router.push('/dashboard');
            },
          });
        } catch {
          if (res.payment_url) window.location.href = res.payment_url;
          else toast.error('Gagal membuka halaman pembayaran. Coba lagi.');
        }
      } else if (res.payment_url) {
        window.location.href = res.payment_url;
      } else {
        toast.error('Data pembayaran tidak ditemukan. Coba lagi.');
      }
    } catch (err: unknown) {
      const e = err as { error?: string; detail?: string };
      const msg = e?.error || 'Checkout gagal';
      const detail = e?.detail;
      toast.error(detail ? `${msg}: ${detail}` : msg, { duration: 8000 });
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <>
      <section className={styles.cartHero}>
        <div className={styles.heroGrid} />
        <div className={styles.heroGlow} />
        <div className={`container ${styles.heroInner}`}>
          <h1 className={styles.heroTitle}>Keranjang Belanja</h1>
          <p className={styles.heroSub}>
            {items.length > 0
              ? `${items.length} buku dipilih untuk checkout`
              : 'Keranjang Anda masih kosong'}
          </p>
        </div>
      </section>

      <div className={`container ${styles.main}`}>
        {items.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>Keranjang Anda masih kosong</h3>
            <p className={styles.emptySub}>
              Jelajahi katalog kami dan tambahkan buku yang Anda inginkan.
            </p>
            <Link href="/catalog" className="btn btn-primary">Jelajahi Katalog</Link>
          </div>
        ) : (
          <div className={styles.layout}>
            <div className={styles.itemListWrap}>
              <div className={styles.itemListHeader}>
                <span className={styles.itemListLabel}>
                  Item dalam keranjang · {items.length}
                </span>
              </div>
              {items.map((item, i) => {
                const book = item.book;
                const coverSrc = book?.cover_url
                  ? book.cover_url.startsWith('http')
                    ? book.cover_url
                    : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${book.cover_url}`
                  : null;
                const publisher = book?.publisher?.full_name || book?.publisher?.name || 'ITS Press';
                const fmt = book?.format?.toUpperCase() ?? '';
                return (
                  <div
                    key={item.ID}
                    className={styles.cartItem}
                    style={{ animationDelay: `${0.08 + i * 0.05}s` }}
                  >
                    <div className={styles.coverThumb}>
                      {coverSrc ? (
                        <img src={coverSrc} alt={book?.title} className={styles.coverImg} />
                      ) : (
                        <div className={styles.coverFallback}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className={styles.itemInfo}>
                      <h3 className={styles.itemTitle}>{book?.title ?? '—'}</h3>
                    </div>
                    <div className={styles.itemRight}>
                      <span className={(book?.price ?? 0) === 0 ? styles.itemPriceFree : styles.itemPrice}>
                        {formatPrice(book?.price ?? 0)}
                      </span>
                      <button
                        className={styles.removeBtn}
                        onClick={() => removeItem(item.book_id)}
                        disabled={removingId === item.book_id}
                        aria-label="Hapus dari keranjang"
                      >
                        {removingId === item.book_id ? (
                          <span className="spinner" style={{ width: 12, height: 12 }} />
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="1" y1="1" x2="11" y2="11" />
                            <line x1="11" y1="1" x2="1" y2="11" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.summaryPanel}>
              <p className={styles.summaryLabel}>Ringkasan Pesanan</p>
              <div className={styles.summaryRows}>
                {items.map(item => (
                  <div key={item.ID} className={styles.summaryRow}>
                    <span className={styles.summaryBookName}>{item.book?.title ?? '—'}</span>
                    <span className={styles.summaryPrice}>{formatPrice(item.book?.price ?? 0)}</span>
                  </div>
                ))}
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalAmount}>{formatPrice(total)}</span>
              </div>
              <button
                className={styles.checkoutBtn}
                onClick={checkout}
                disabled={checkingOut}
              >
                {checkingOut ? (
                  <>
                    <span
                      className="spinner"
                      style={{
                        width: 14, height: 14,
                        borderColor: 'rgba(1,74,143,0.20)',
                        borderTopColor: 'var(--its-navy)',
                      }}
                    />
                    Memproses...
                  </>
                ) : (
                  'Checkout Semua'
                )}
              </button>
              <Link href="/catalog" className={styles.continueLink}>
                ← Lanjutkan Belanja
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
