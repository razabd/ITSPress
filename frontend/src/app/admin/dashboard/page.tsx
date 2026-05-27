'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { formatLabel } from '@/lib/format';

// --- Types ---
interface AdminUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
}

interface AdminBook {
  ID: number;
  title: string;
  description: string;
  cover_url: string;
  format: string;
  price: number;
  publisher?: { full_name: string; email: string };
  lcp_content_id: string;
  is_withdrawn?: boolean;
  preview_page_count?: number;
  CreatedAt: string;
}

interface AdminTransaction {
  ID: number;
  status: string;
  midtrans_order_id: string;
  user?: { full_name: string; email: string };
  book?: { title: string };
  CreatedAt: string;
}

interface AdminLicense {
  ID: number;
  lcp_license_id: string;
  revoked_at: string | null;
  user?: { full_name: string; email: string };
  book?: { title: string };
  CreatedAt: string;
}

type Tab = 'users' | 'books' | 'transactions' | 'licenses';

// --- Helper ---
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPrice(p: number) {
  return p === 0 ? 'Gratis' : `Rp ${p.toLocaleString('id-ID')}`;
}

// --- Sub-components ---

function UsersTab() {
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [role, setRole]       = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get(`/admin/users${role !== 'all' ? `?role=${role}` : ''}`)
      .then(d => setUsers(d.data || []))
      .finally(() => setLoading(false));
  }, [role]);

  useEffect(() => { load(); }, [load]);

  const deactivate = async (id: number) => {
    if (!confirm('Nonaktifkan akun ini?')) return;
    setBusy(id);
    try {
      await apiClient.delete(`/admin/users/${id}`);
      toast.success('Akun dinonaktifkan');
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal');
    } finally { setBusy(null); }
  };

  const reactivate = async (id: number) => {
    setBusy(id);
    try {
      await apiClient.post(`/admin/users/${id}/reactivate`, {});
      toast.success('Akun diaktifkan kembali');
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal');
    } finally { setBusy(null); }
  };

  return (
    <>
      <div className={styles.toolbar}>
        <select className={styles.filterSelect} value={role} onChange={e => setRole(e.target.value)}>
          <option value="all">Semua Role</option>
          <option value="pelanggan">Pelanggan</option>
          <option value="publisher">Publisher</option>
          <option value="admin">Admin</option>
        </select>
        <span className={styles.toolbarCount}>{users.length} user ditemukan</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Terdaftar</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Memuat data...</td></tr>
            ) : users.length === 0 ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Tidak ada user ditemukan.</td></tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{u.full_name}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{u.email}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 500 }}>{u.role}</td>
                <td>
                  {!u.is_active
                    ? <span className={`${styles.statusDot} ${styles.sdDanger}`}>Nonaktif</span>
                    : !u.is_email_verified
                      ? <span className={`${styles.statusDot} ${styles.sdWarning}`}>Perlu Verifikasi</span>
                      : <span className={`${styles.statusDot} ${styles.sdSuccess}`}>Aktif</span>}
                </td>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{formatDate(u.created_at)}</td>
                <td>
                  {u.role === 'pelanggan' ? (
                    u.is_active ? (
                      <button
                        className={`${styles.actionBtn} ${styles.btnDanger}`}
                        onClick={() => deactivate(u.id)}
                        disabled={busy === u.id}
                      >
                        Nonaktifkan
                      </button>
                    ) : (
                      <button
                        className={`${styles.actionBtn} ${styles.btnSuccess}`}
                        onClick={() => reactivate(u.id)}
                        disabled={busy === u.id}
                      >
                        Aktifkan
                      </button>
                    )
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BooksTab() {
  const [books, setBooks]     = useState<AdminBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get('/admin/books')
      .then(d => setBooks(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteBook = async (id: number, title: string) => {
    if (!confirm(`Hapus buku "${title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setBusy(id);
    try {
      await apiClient.delete(`/admin/books/${id}`);
      toast.success('Buku berhasil dihapus');
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal menghapus buku');
    } finally { setBusy(null); }
  };

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.toolbarCount}>{books.length} buku ditemukan</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Judul</th>
              <th>Publisher</th>
              <th>Format</th>
              <th>Harga</th>
              <th>Status Enkripsi</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Memuat data...</td></tr>
            ) : books.length === 0 ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Belum ada buku.</td></tr>
            ) : books.map(b => (
              <tr key={b.ID}>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 240 }}>{b.title}</td>
                <td>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{b.publisher?.full_name ?? '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.publisher?.email ?? ''}</div>
                </td>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {formatLabel(b.format)}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{formatPrice(b.price)}</td>
                <td>
                  {b.is_withdrawn
                    ? <span className={`${styles.statusDot} ${styles.sdMuted}`}>Ditarik Publisher</span>
                    : b.lcp_content_id
                      ? <span className={`${styles.statusDot} ${styles.sdSuccess}`}>Terenkripsi LCP</span>
                      : <span className={`${styles.statusDot} ${styles.sdWarning}`}>Belum Dienkripsi</span>}
                </td>
                <td>
                  <button
                    className={`${styles.actionBtn} ${styles.btnDanger}`}
                    onClick={() => deleteBook(b.ID, b.title)}
                    disabled={busy === b.ID}
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TransactionsTab() {
  const [txs, setTxs]         = useState<AdminTransaction[]>([]);
  const [status, setStatus]   = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get(`/admin/transactions${status !== 'all' ? `?status=${status}` : ''}`)
      .then(d => setTxs(d.data || []))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const statusDot = (s: string) => {
    if (s === 'success') return <span className={`${styles.statusDot} ${styles.sdSuccess}`}>Sukses</span>;
    if (s === 'failed')  return <span className={`${styles.statusDot} ${styles.sdDanger}`}>Gagal</span>;
    return <span className={`${styles.statusDot} ${styles.sdWarning}`}>Pending</span>;
  };

  return (
    <>
      <div className={styles.toolbar}>
        <select className={styles.filterSelect} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="success">Sukses</option>
          <option value="failed">Gagal</option>
        </select>
        <span className={styles.toolbarCount}>{txs.length} transaksi ditemukan</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID Order</th>
              <th>Pembeli</th>
              <th>Buku</th>
              <th>Status</th>
              <th>Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.emptyRow}><td colSpan={5}>Memuat data...</td></tr>
            ) : txs.length === 0 ? (
              <tr className={styles.emptyRow}><td colSpan={5}>Tidak ada transaksi ditemukan.</td></tr>
            ) : txs.map(tx => (
              <tr key={tx.ID}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {tx.midtrans_order_id || `#${tx.ID}`}
                </td>
                <td>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{tx.user?.full_name ?? '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.user?.email ?? ''}</div>
                </td>
                <td style={{ maxWidth: 200, color: 'var(--text-secondary)' }}>{tx.book?.title ?? '—'}</td>
                <td>{statusDot(tx.status)}</td>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{formatDate(tx.CreatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LicensesTab() {
  const [licenses, setLicenses] = useState<AdminLicense[]>([]);
  const [email, setEmail]       = useState('');
  const [revoked, setRevoked]   = useState('all');
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (email) params.set('email', email);
    if (revoked !== 'all') params.set('revoked', revoked);
    apiClient.get(`/admin/licenses?${params.toString()}`)
      .then(d => setLicenses(d.data || []))
      .finally(() => setLoading(false));
  }, [email, revoked]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (lic: AdminLicense) => {
    if (!confirm(`Cabut lisensi milik ${lic.user?.email ?? '?'} untuk buku "${lic.book?.title ?? '?'}"?`)) return;
    setBusy(lic.ID);
    try {
      await apiClient.post(`/admin/licenses/${lic.ID}/revoke`, {});
      toast.success('Lisensi berhasil dicabut');
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal mencabut lisensi');
    } finally { setBusy(null); }
  };

  const reissue = async (lic: AdminLicense) => {
    if (!confirm(`Terbitkan ulang lisensi untuk ${lic.user?.email ?? '?'}? Lisensi lama akan dihapus.`)) return;
    setBusy(lic.ID);
    try {
      await apiClient.post(`/admin/licenses/${lic.ID}/reissue`, {});
      toast.success('Lisensi baru berhasil diterbitkan');
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal menerbitkan ulang');
    } finally { setBusy(null); }
  };

  const licenseStatus = (lic: AdminLicense) => {
    if (lic.revoked_at) return <span className={`${styles.statusDot} ${styles.sdDanger}`}>Dicabut</span>;
    return <span className={`${styles.statusDot} ${styles.sdSuccess}`}>Aktif</span>;
  };

  return (
    <>
      <div className={styles.toolbar}>
        <input
          className={styles.filterSelect}
          style={{ width: 220 }}
          type="text"
          placeholder="Filter email pengguna..."
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <select className={styles.filterSelect} value={revoked} onChange={e => setRevoked(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="false">Aktif</option>
          <option value="true">Dicabut</option>
        </select>
        <span className={styles.toolbarCount}>{licenses.length} lisensi ditemukan</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pengguna</th>
              <th>Buku</th>
              <th>LCP License ID</th>
              <th>Status</th>
              <th>Diterbitkan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Memuat data...</td></tr>
            ) : licenses.length === 0 ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Tidak ada lisensi ditemukan.</td></tr>
            ) : licenses.map(lic => (
              <tr key={lic.ID}>
                <td>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{lic.user?.full_name ?? '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lic.user?.email ?? ''}</div>
                </td>
                <td style={{ maxWidth: 200, color: 'var(--text-secondary)' }}>{lic.book?.title ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 160, wordBreak: 'break-all' }}>
                  {lic.lcp_license_id || '—'}
                </td>
                <td>{licenseStatus(lic)}</td>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{formatDate(lic.CreatedAt)}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!lic.revoked_at && (
                    <button
                      className={`${styles.actionBtn} ${styles.btnDanger}`}
                      onClick={() => revoke(lic)}
                      disabled={busy === lic.ID}
                    >
                      Cabut
                    </button>
                  )}
                  <button
                    className={`${styles.actionBtn} ${styles.btnSuccess}`}
                    onClick={() => reissue(lic)}
                    disabled={busy === lic.ID}
                  >
                    Terbitkan Ulang
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Main Page ---

export default function AdminDashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'admin') return null;

  return (
    <>
      {/* ── Admin Hero ── */}
      <div className={styles.adminHero}>
        <div className={styles.adminHeroOverlay} />
        <div className={styles.adminHeroGlow} />
        <div className="container">
          <div className={styles.adminHeroInner}>
            <p className={styles.adminGreetLabel}>Panel Admin · ITSPress</p>
            <h1 className={styles.adminGreetName}>
              Selamat datang, <strong>{user.name}</strong>
            </h1>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="container">
        <nav className={styles.tabNav}>
          {([
            { id: 'users',        label: 'Users'       },
            { id: 'books',        label: 'Semua Buku'  },
            { id: 'transactions', label: 'Transaksi'   },
            { id: 'licenses',     label: 'Lisensi'     },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'users'        && <UsersTab />}
        {tab === 'books'        && <BooksTab />}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'licenses'     && <LicensesTab />}
      </div>
    </>
  );
}
