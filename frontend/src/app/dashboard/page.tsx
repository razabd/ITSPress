'use client';

import { useState, useEffect } from 'react';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { License, Transaction } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import ConfirmModal from '@/components/ConfirmModal';

const backendBase = API_BASE_URL.replace(/\/api\/v1$/, '');

function coverSrc(url: string) {
  return url.startsWith('http') ? url : `${backendBase}${url}`;
}

function BookCover({ url, title }: { url?: string; title: string }) {
  return url ? (
    <img src={coverSrc(url)} alt={title} className={styles.itemCoverImg} />
  ) : (
    <div className={styles.itemCoverPlaceholder} aria-hidden />
  );
}

export default function DashboardPage() {
  const { user, isLoading, needsPassphrase } = useAuth();
  const { t } = useLang();
  const router = useRouter();

  const [licenses, setLicenses]         = useState<License[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData]   = useState(true);
  const [downloading, setDownloading]   = useState<number | null>(null);
  const [cancelling, setCancelling]     = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [ebookSearch, setEbookSearch]   = useState('');

  const fetchAll = () =>
    Promise.all([
      apiClient.get('/licenses').then(d => setLicenses(d.data || [])),
      apiClient.get('/transactions').then(d => setTransactions(d.data || [])),
    ]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (needsPassphrase) { router.replace('/setup-passphrase'); return; }
    if (user.role === 'publisher') { router.replace('/publisher/dashboard'); return; }
    if (user.role === 'admin') { router.replace('/admin/dashboard'); return; }
    fetchAll().finally(() => setLoadingData(false));
  }, [user, isLoading, router]);

  // Poll setiap 5 detik saat ada transaksi pending ATAU transaksi success yang lisensinya belum muncul
  const activeLicenseBookIds = new Set(licenses.map(l => l.book_id));
  const hasPendingOrGenerating = transactions.some(tx =>
    (tx.status === 'pending' && tx.payment_url) ||
    (tx.status === 'success' && tx.book_id != null && !activeLicenseBookIds.has(tx.book_id))
  );
  useEffect(() => {
    if (!hasPendingOrGenerating) return;
    const timer = setInterval(async () => {
      const res = await apiClient.get('/transactions').catch(() => null);
      if (!res) return;
      const allTxs: Transaction[] = res.data || [];

      const pending = allTxs.filter(tx => tx.status === 'pending' && tx.payment_url);
      await Promise.all(
        pending.map(tx => apiClient.get(`/transactions/${tx.ID}/status`).catch(() => null))
      );

      // Refresh semua data — transaksi mungkin berubah jadi success + lisensi auto-generated
      await fetchAll();
    }, 5000);
    return () => clearInterval(timer);
  }, [hasPendingOrGenerating]);

  const downloadLicense = async (licenseId: number, bookTitle: string) => {
    setDownloading(licenseId);
    try {
      await apiClient.downloadFile(`/licenses/${licenseId}/download`, `${bookTitle}.lcpl`);
      toast.success('File lisensi (.lcpl) berhasil diunduh!');
    } catch {
      toast.error('Gagal mengunduh lisensi');
    } finally { setDownloading(null); }
  };

  const cancelTransaction = async (txId: number) => {
    setCancelTarget(txId);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const txId = cancelTarget;
    setCancelTarget(null);
    setCancelling(txId);
    try {
      await apiClient.delete(`/transactions/${txId}`);
      toast.success('Transaksi dibatalkan.');
      const fresh = await apiClient.get('/transactions');
      setTransactions(fresh.data || []);
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal membatalkan transaksi');
      setTimeout(async () => {
        try { const fresh = await apiClient.get('/transactions'); setTransactions(fresh.data || []); } catch { /* ignore */ }
      }, 1500);
    } finally { setCancelling(null); }
  };

  const resumePayment = (tx: Transaction) => {
    if (tx.snap_token && typeof window !== 'undefined' && window.snap) {
      window.snap.pay(tx.snap_token, {
        onSuccess: () => {
          toast.success('Pembayaran berhasil! E-book Anda sedang disiapkan.');
          fetchAll();
        },
        onPending: () => toast('Menunggu konfirmasi bank.', { icon: '⏳' }),
        onError:   () => toast.error('Pembayaran gagal.'),
        onClose:   () => {},
      });
    } else if (tx.payment_url) {
      window.open(tx.payment_url, '_blank');
    }
  };

  if (isLoading || loadingData) return (
    <div className="container"><div className={styles.loading}><span className="spinner" /></div></div>
  );

  const cancelTargetTx = transactions.find(tx => tx.ID === cancelTarget);

  const pendingPaymentTxs = transactions.filter(
    tx => tx.status === 'pending' && tx.payment_url
  );

  return (
    <div className="container">
      <ConfirmModal
        open={cancelTarget !== null}
        title="Batalkan Transaksi?"
        message={`Batalkan pembelian "${cancelTargetTx?.book?.title ?? ''}"? Anda perlu membeli ulang dari katalog jika berubah pikiran.`}
        confirmLabel="Ya, Batalkan"
        danger
        loading={cancelling === cancelTarget}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <div className="page-header">
        <h1>{t('dashboard.title')}</h1>
        <p>{t('dashboard.welcome')} <strong>{user?.name}</strong>!</p>
      </div>

      {/* ── Menunggu Pembayaran ── */}
      {pendingPaymentTxs.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Menunggu Pembayaran</h2>
          <div className={styles.list}>
            {pendingPaymentTxs.map(tx => (
              <div key={tx.ID} className={`card ${styles.itemCard} ${styles.itemCardPayment}`}>
                <BookCover url={tx.book?.cover_url} title={tx.book?.title || '—'} />
                <div className={styles.itemInfo}>
                  <p className={styles.itemTitle}>{tx.book?.title || '—'}</p>
                  <p className={styles.itemMeta}>
                    Transaksi #{tx.ID}
                    <span className={styles.statusDot} style={{ background: 'var(--its-navy-mid)' }} />
                    <span className={styles.statusText} style={{ color: 'var(--its-navy-mid)' }}>
                      Belum Dibayar
                    </span>
                    <span className={styles.pollingDot} title="Memantau status otomatis..." />
                  </p>
                  <p className={styles.itemHint}>
                    Ingin ganti metode bayar? Batalkan lalu beli ulang dari katalog.
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => resumePayment(tx)}
                  >
                    Lanjutkan Bayar
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => cancelTransaction(tx.ID)}
                    disabled={cancelling === tx.ID}
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  >
                    {cancelling === tx.ID ? <span className="spinner" style={{ borderTopColor: 'var(--danger)' }} /> : 'Batalkan'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── E-book Saya ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('dashboard.myEbooks')}</h2>
          {licenses.length > 0 && (
            <div className={styles.searchWrap}>
              <input
                type="search"
                className={`form-input ${styles.searchInput}`}
                placeholder="Cari judul e-book..."
                value={ebookSearch}
                onChange={e => setEbookSearch(e.target.value)}
              />
              {ebookSearch && (
                <button
                  className={styles.searchClear}
                  onClick={() => setEbookSearch('')}
                  aria-label="Hapus pencarian"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {licenses.length === 0 ? (
          <div className="empty-state">
            <h3>{t('dashboard.emptyTitle')}</h3>
            <p>{t('dashboard.emptySub')}</p>
          </div>
        ) : (() => {
          const q = ebookSearch.trim().toLowerCase();
          const filtered = q
            ? licenses.filter(l => l.book?.title?.toLowerCase().includes(q))
            : licenses;
          return filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 20px' }}>
              <h3 style={{ fontSize: '0.95rem' }}>Tidak ada hasil</h3>
              <p>Tidak ditemukan e-book dengan judul &ldquo;{ebookSearch}&rdquo;.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {filtered.map(license => (
                <div key={license.ID} className={`card ${styles.itemCard} ${styles.itemCardActive}`}>
                  <BookCover url={license.book?.cover_url} title={license.book?.title || '—'} />
                  <div className={styles.itemInfo}>
                    <p className={styles.itemTitle}>{license.book?.title || '—'}</p>
                    <p className={styles.itemMeta}>
                      <span className={styles.statusDot} style={{ background: 'var(--success)' }} />
                      <span className={styles.statusText} style={{ color: 'var(--success)' }}>Aktif</span>
                    </p>
                  </div>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => downloadLicense(license.ID, license.book?.title || 'ebook')}
                    disabled={downloading === license.ID}>
                    {downloading === license.ID ? <span className="spinner" /> : t('dashboard.downloadBtn')}
                  </button>
                </div>
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
