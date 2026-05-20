'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { License, Transaction } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import ConfirmModal from '@/components/ConfirmModal';

type Tab = 'ebooks' | 'transaksi';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ebooks',    label: 'E-book Saya' },
  { id: 'transaksi', label: 'Riwayat Transaksi' },
];

const backendBase = API_BASE_URL.replace(/\/api\/v1$/, '');

interface TxGroup {
  orderId: string;
  txs: Transaction[];
  status: 'pending' | 'success' | 'failed';
  snapToken?: string;
  paymentUrl?: string;
  total: number;
  createdAt: string;
}

function buildGroups(txs: Transaction[]): TxGroup[] {
  const map = new Map<string, TxGroup>();
  for (const tx of txs) {
    const key = tx.midtrans_order_id || `__solo__${tx.ID}`;
    if (!map.has(key)) {
      map.set(key, { orderId: key, txs: [], status: tx.status, total: 0, createdAt: tx.CreatedAt });
    }
    const g = map.get(key)!;
    g.txs.push(tx);
    g.total += tx.book?.price ?? 0;
    if (tx.snap_token) g.snapToken = tx.snap_token;
    if (tx.payment_url) g.paymentUrl = tx.payment_url;
    if (tx.CreatedAt < g.createdAt) g.createdAt = tx.CreatedAt;
  }
  return Array.from(map.values());
}

function coverSrc(url: string) {
  return url.startsWith('http') ? url : `${backendBase}${url}`;
}

function BookCover({ url, title, imgCls, placeholderCls }: {
  url?: string; title: string; imgCls?: string; placeholderCls?: string;
}) {
  return url ? (
    <img src={coverSrc(url)} alt={title} className={imgCls ?? styles.ebookCoverImg} />
  ) : (
    <div className={placeholderCls ?? styles.ebookCoverPlaceholder} aria-hidden />
  );
}

function CoverStack({ txs, small = false }: { txs: Transaction[]; small?: boolean }) {
  const imgCls = small ? styles.txCoverImg        : styles.pendingCoverImg;
  const phCls  = small ? styles.txCoverPlaceholder : styles.pendingCoverPlaceholder;
  if (txs.length === 1) {
    return (
      <BookCover
        url={txs[0].book?.cover_url}
        title={txs[0].book?.title || '—'}
        imgCls={imgCls}
        placeholderCls={phCls}
      />
    );
  }
  return (
    <div className={small ? styles.coverStackSm : styles.coverStack}>
      <div className={styles.coverStackBack}>
        <BookCover
          url={txs[1].book?.cover_url}
          title={txs[1].book?.title || '—'}
          imgCls={imgCls}
          placeholderCls={phCls}
        />
      </div>
      <div className={styles.coverStackFront}>
        <BookCover
          url={txs[0].book?.cover_url}
          title={txs[0].book?.title || '—'}
          imgCls={imgCls}
          placeholderCls={phCls}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
        <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user, isLoading, needsPassphrase } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = rawTab && TABS.some(t => t.id === rawTab) ? rawTab : 'ebooks';
  const setTab = (tab: Tab) => router.push(`?tab=${tab}`, { scroll: false });

  const [licenses, setLicenses]               = useState<License[]>([]);
  const [transactions, setTransactions]       = useState<Transaction[]>([]);
  const [loadingData, setLoadingData]         = useState(true);
  const [downloading, setDownloading]         = useState<number | null>(null);
  const [cancelling, setCancelling]           = useState<number | null>(null);
  const [cancelGroup, setCancelGroup]         = useState<Transaction[] | null>(null);
  const [ebookSearch, setEbookSearch]         = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

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

  const activeLicenseBookIds = new Set(licenses.map(l => l.book_id));

  // Light polling only for license generation (not for Midtrans payment status).
  // Midtrans webhook handles payment status updates in real-time.
  const hasGeneratingLicense = transactions.some(
    tx => tx.status === 'success' && tx.book_id != null && !activeLicenseBookIds.has(tx.book_id)
  );

  useEffect(() => {
    if (!hasGeneratingLicense) return;
    const timer = setInterval(() => fetchAll(), 5000);
    return () => clearInterval(timer);
  }, [hasGeneratingLicense]);

  // Refresh when user returns to this tab (e.g. after paying on external Midtrans page)
  useEffect(() => {
    const onFocus = () => fetchAll();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Poll Midtrans status every 10s while there are pending transactions.
  // GET /transactions/:id triggers syncStatusFromMidtrans on the backend,
  // catching cases where the Midtrans webhook didn't arrive (e.g. delay, network issue).
  const pendingIdsRef = useRef<number[]>([]);
  pendingIdsRef.current = buildGroups(
    transactions.filter(tx => tx.status === 'pending' && tx.payment_url)
  ).map(g => g.txs[0].ID);
  const hasPendingPayment = pendingIdsRef.current.length > 0;

  useEffect(() => {
    if (!hasPendingPayment) return;
    const timer = setInterval(async () => {
      const ids = pendingIdsRef.current;
      if (ids.length === 0) return;
      await Promise.all(ids.map(id =>
        apiClient.get(`/transactions/${id}/status`).catch(() => {})
      ));
      fetchAll();
    }, 10000);
    return () => clearInterval(timer);
  }, [hasPendingPayment]);

  const downloadLicense = async (licenseId: number, bookTitle: string) => {
    setDownloading(licenseId);
    try {
      await apiClient.downloadFile(`/licenses/${licenseId}/download`, `${bookTitle}.lcpl`);
      toast.success('File lisensi (.lcpl) berhasil diunduh!');
    } catch {
      toast.error('Gagal mengunduh lisensi');
    } finally { setDownloading(null); }
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  const confirmCancelGroup = async () => {
    if (!cancelGroup || cancelGroup.length === 0) return;
    const group = cancelGroup;
    setCancelGroup(null);
    setCancelling(group[0].ID);
    try {
      await Promise.all(group.map(tx => apiClient.delete(`/transactions/${tx.ID}`)));
      toast.success('Transaksi dibatalkan.');
      const fresh = await apiClient.get('/transactions');
      setTransactions(fresh.data || []);
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal membatalkan transaksi');
      try {
        const fresh = await apiClient.get('/transactions');
        setTransactions(fresh.data || []);
      } catch { /* ignore */ }
    } finally { setCancelling(null); }
  };

  const resumeGroupPayment = (group: TxGroup) => {
    if (!group.snapToken && !group.paymentUrl) {
      toast.error('Data pembayaran tidak ditemukan. Coba muat ulang halaman.');
      return;
    }
    if (group.snapToken && typeof window !== 'undefined' && window.snap) {
      try {
        window.snap.pay(group.snapToken, {
          onSuccess: async () => {
            toast.success('Pembayaran berhasil! E-book Anda sedang disiapkan.');
            await Promise.all(group.txs.map(tx =>
              apiClient.get(`/transactions/${tx.ID}/status`).catch(() => {})
            ));
            fetchAll();
          },
          onPending: () => toast('Menunggu konfirmasi bank.', { icon: '⏳' }),
          onError:   () => { toast.error('Pembayaran gagal.'); fetchAll(); },
          onClose:   () => {},
        });
      } catch {
        if (group.paymentUrl) window.location.href = group.paymentUrl;
        else toast.error('Gagal membuka halaman pembayaran.');
      }
    } else if (group.paymentUrl) {
      window.location.href = group.paymentUrl;
    }
  };

  if (isLoading || loadingData) return (
    <div className="container"><div className={styles.loading}><span className="spinner" /></div></div>
  );

  const pendingGroups = buildGroups(
    transactions.filter(tx => tx.status === 'pending' && tx.payment_url)
  );
  const allGroups = buildGroups([...transactions])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const cancelMsg = cancelGroup
    ? cancelGroup.length > 1
      ? `Batalkan pesanan berisi ${cancelGroup.length} buku? Anda perlu membeli ulang dari katalog jika berubah pikiran.`
      : `Batalkan pembelian "${cancelGroup[0]?.book?.title ?? ''}"? Anda perlu membeli ulang dari katalog jika berubah pikiran.`
    : '';

  return (
    <>
      <ConfirmModal
        open={cancelGroup !== null}
        title="Batalkan Pesanan?"
        message={cancelMsg}
        confirmLabel="Ya, Batalkan"
        danger
        loading={cancelling !== null}
        onConfirm={confirmCancelGroup}
        onCancel={() => setCancelGroup(null)}
      />

      {/* ── Hero Header ── */}
      <div className={styles.dashHero}>
        <div className={styles.dashHeroOverlay} />
        <div className={styles.dashHeroGlow} />
        <div className="container">
          <div className={styles.dashHeroInner}>
            <div className={styles.dashGreeting}>
              <p className={styles.dashGreetLabel}>Dashboard Pelanggan</p>
              <h1 className={styles.dashGreetName}>
                Selamat datang, <strong>{user?.name}</strong>
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="container">

        {/* Tab Navigation */}
        <nav className={styles.tabNav}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
              onClick={() => setTab(tab.id)}
            >
              {tab.label}
              {tab.id === 'ebooks' && licenses.length > 0 && (
                <span className={styles.tabCount}>{licenses.length}</span>
              )}
              {tab.id === 'transaksi' && pendingGroups.length > 0 && (
                <span className={`${styles.tabCount} ${styles.tabCountPending}`}>
                  {pendingGroups.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* ── TAB: E-book Saya ── */}
        {activeTab === 'ebooks' && (
          <div className={styles.tabContent}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionTitle}>{t('dashboard.myEbooks')}</p>
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
                    >✕</button>
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
                <div className={styles.ebookGrid}>
                  {filtered.map(license => (
                    <div key={license.ID} className={styles.ebookCard}>
                      <BookCover
                        url={license.book?.cover_url}
                        title={license.book?.title || '—'}
                        imgCls={styles.ebookCoverImg}
                        placeholderCls={styles.ebookCoverPlaceholder}
                      />
                      <div className={styles.ebookInfo}>
                        <p className={styles.ebookTitle}>{license.book?.title || '—'}</p>
                        <div className={styles.ebookStatusRow}>
                          <span className={styles.ebookStatusDot} />
                          Aktif
                        </div>
                        <button
                          className={`btn btn-primary btn-sm ${styles.ebookDlBtn}`}
                          onClick={() => downloadLicense(license.ID, license.book?.title || 'ebook')}
                          disabled={downloading === license.ID}
                        >
                          {downloading === license.ID
                            ? <span className="spinner" />
                            : t('dashboard.downloadBtn')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TAB: Riwayat Transaksi ── */}
        {activeTab === 'transaksi' && (
          <div className={styles.tabContent}>
            {transactions.length === 0 ? (
              <div className="empty-state">
                <h3>Belum ada transaksi</h3>
                <p>Riwayat pembelian e-book Anda akan muncul di sini.</p>
              </div>
            ) : (
              <>
                {/* Pending payment groups */}
                {pendingGroups.length > 0 && (
                  <div className={styles.sectionBlock}>
                    <p className={styles.sectionTitle}>Menunggu Pembayaran</p>
                    <div className={styles.txList}>
                      {pendingGroups.map(group => {
                        const isMulti    = group.txs.length > 1;
                        const isExpanded = expandedOrderIds.has(group.orderId);
                        const isCancelling = cancelling !== null && group.txs.some(tx => tx.ID === cancelling);
                        const total      = group.total > 0
                          ? `Rp ${group.total.toLocaleString('id-ID')}`
                          : 'Gratis';

                        return (
                          <div key={group.orderId} className={styles.pendingCard}>
                            <CoverStack txs={group.txs} />
                            <div className={styles.pendingInfo}>
                              <p className={styles.pendingTitle}>
                                {group.txs[0].book?.title || '—'}
                              </p>

                              {isMulti && (
                                <button
                                  className={styles.expandToggle}
                                  onClick={() => toggleExpand(group.orderId)}
                                >
                                  {isExpanded
                                    ? '▲ Sembunyikan'
                                    : `+${group.txs.length - 1} buku lainnya`}
                                </button>
                              )}

                              {isExpanded && (
                                <div className={styles.expandList}>
                                  {group.txs.map(tx => (
                                    <div key={tx.ID} className={styles.expandItem}>
                                      <span className={styles.expandItemTitle}>{tx.book?.title || '—'}</span>
                                      <span className={styles.expandItemPrice}>
                                        {(tx.book?.price ?? 0) === 0
                                          ? 'Gratis'
                                          : `Rp ${tx.book!.price.toLocaleString('id-ID')}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className={styles.pendingMeta}>
                                {isMulti
                                  ? <span>{group.txs.length} item</span>
                                  : <span>#{group.txs[0].ID}</span>}
                                <span className={styles.pendingStatusText}>Belum Dibayar</span>
                                <span className={styles.pollingDot} title="Memantau status otomatis..." />
                              </div>

                              {isMulti && (
                                <p className={styles.groupTotal}>Total: {total}</p>
                              )}

                              <p className={styles.pendingHint}>
                                Ingin ganti metode bayar? Batalkan lalu beli ulang dari katalog.
                              </p>
                            </div>

                            <div className={styles.pendingActions}>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => resumeGroupPayment(group)}
                              >
                                Lanjutkan Bayar
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setCancelGroup(group.txs)}
                                disabled={isCancelling}
                                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              >
                                {isCancelling
                                  ? <span className="spinner" style={{ borderTopColor: 'var(--danger)' }} />
                                  : 'Batalkan'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All transactions grouped */}
                <div className={styles.sectionBlock}>
                  <p className={styles.sectionTitle}>Semua Transaksi</p>
                  <div className={styles.txList}>
                    {allGroups.map(group => {
                      const statusCls =
                        group.status === 'success' ? styles.txStatusSuccess :
                        group.status === 'failed'  ? styles.txStatusFailed  :
                        styles.txStatusPending;
                      const statusLabel =
                        group.status === 'success' ? 'Berhasil' :
                        group.status === 'failed'  ? 'Gagal'    :
                        'Menunggu';
                      const d = new Date(group.createdAt);
                      const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                      const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                      const isMulti = group.txs.length > 1;
                      const price   = group.total === 0
                        ? 'Gratis'
                        : `Rp ${group.total.toLocaleString('id-ID')}`;

                      return (
                        <div key={group.orderId} className={styles.txCard}>
                          <CoverStack txs={group.txs} small />
                          <div className={styles.txInfo}>
                            <p className={styles.txTitle}>{group.txs[0].book?.title || '—'}</p>
                            {isMulti && (
                              <p className={styles.txMoreBooks}>+{group.txs.length - 1} buku lainnya</p>
                            )}
                            <p className={styles.txPrice}>{price}</p>
                            <p className={styles.txDate}>{dateStr} · {timeStr}</p>
                          </div>
                          <div className={`${styles.txStatus} ${statusCls}`}>
                            <span className={styles.txStatusDot} />
                            {statusLabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
