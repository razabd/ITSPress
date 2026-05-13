'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL, apiClient } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';

export default function CartPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { items, refresh: refreshCart, clear: clearCart } = useCart();
  const router = useRouter();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  // Redirect ke login hanya setelah AuthContext selesai loading
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Tampilkan loading saat auth belum selesai atau user belum ada
  if (authLoading || !user) {
    return null;
  }

  const total = items.reduce((sum, item) => sum + (item.book?.price ?? 0), 0);

  const removeItem = async (bookId: number) => {
    setRemovingId(bookId);
    try {
      await apiClient.delete(`/cart/${bookId}`);
      await refreshCart();
    } catch {
      toast.error('Gagal menghapus item');
    } finally {
      setRemovingId(null);
    }
  };

  const checkout = async () => {
    setCheckingOut(true);
    try {
      const res = await apiClient.post('/cart/checkout', {});

      if (res.status === 'success') {
        clearCart();
        toast.success('Checkout berhasil! Aktifkan lisensi di dashboard.');
        router.push('/dashboard');
        return;
      }

      if (res.snap_token && typeof window !== 'undefined' && window.snap) {
        window.snap.pay(res.snap_token, {
          onSuccess: () => {
            // Optimistic clear — webhook akan konfirmasi di background
            clearCart();
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
      } else if (res.payment_url) {
        window.location.href = res.payment_url;
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
    <div className="container">
      <div className="page-header">
        <h1>Keranjang Belanja</h1>
        <p>{items.length > 0 ? `${items.length} buku dipilih` : 'Keranjang Anda masih kosong'}</p>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} />
          <h3>Keranjang Anda masih kosong</h3>
          <p>Jelajahi katalog kami dan tambahkan buku yang Anda inginkan.</p>
          <Link href="/catalog" className="btn btn-primary">Jelajahi Katalog</Link>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.itemList}>
            {items.map(item => {
              const book = item.book;
              const coverSrc = book?.cover_url
                ? book.cover_url.startsWith('http')
                  ? book.cover_url
                  : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${book.cover_url}`
                : null;
              return (
                <div key={item.ID} className={`card ${styles.cartItem}`}>
                  <div className={styles.coverThumb}>
                    {coverSrc
                      ? <img src={coverSrc} alt={book?.title} className={styles.coverImg} />
                      : <div className={styles.coverFallback}>📚</div>
                    }
                  </div>
                  <div className={styles.itemInfo}>
                    <h3 className={styles.itemTitle}>{book?.title ?? '—'}</h3>
                    <p className={styles.itemPublisher}>
                      {book?.publisher?.full_name || book?.publisher?.name || 'ITS Press'}
                    </p>
                  </div>
                  <div className={styles.itemRight}>
                    <span className={styles.itemPrice}>
                      {(book?.price ?? 0) === 0 ? 'Gratis' : `Rp ${(book?.price ?? 0).toLocaleString('id-ID')}`}
                    </span>
                    <button
                      className={styles.removeBtn}
                      onClick={() => removeItem(item.book_id)}
                      disabled={removingId === item.book_id}
                      aria-label="Hapus dari keranjang"
                    >
                      {removingId === item.book_id
                        ? <span className="spinner" style={{ width: 14, height: 14 }} />
                        : '✕'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.summary}>
            <div className={`card ${styles.summaryCard}`}>
              <h3 className={styles.summaryTitle}>Ringkasan Pesanan</h3>
              <div className={styles.summaryRows}>
                {items.map(item => (
                  <div key={item.ID} className={styles.summaryRow}>
                    <span className={styles.summaryBookName}>{item.book?.title ?? '—'}</span>
                    <span className={styles.summaryPrice}>
                      {(item.book?.price ?? 0) === 0 ? 'Gratis' : `Rp ${(item.book?.price ?? 0).toLocaleString('id-ID')}`}
                    </span>
                  </div>
                ))}
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryTotal}>
                <span>Total</span>
                <span className={styles.totalAmount}>
                  {total === 0 ? 'Gratis' : `Rp ${total.toLocaleString('id-ID')}`}
                </span>
              </div>
              <button
                className={`btn btn-primary ${styles.checkoutBtn}`}
                onClick={checkout}
                disabled={checkingOut}
              >
                {checkingOut ? <><span className="spinner" /> Memproses...</> : 'Checkout Semua'}
              </button>
              <Link href="/catalog" className={styles.continueLink}>
                ← Lanjutkan Belanja
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
