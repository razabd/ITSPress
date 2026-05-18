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

type Tab = 'users' | 'books' | 'transactions';

// --- Helper ---
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPrice(p: number) {
  return p === 0 ? 'Gratis' : `Rp ${p.toLocaleString('id-ID')}`;
}

// --- Sub-components ---

function UsersTab() {
  const [users, setUsers]   = useState<AdminUser[]>([]);
  const [role, setRole]     = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState<number | null>(null);

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
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {users.length} user ditemukan
        </span>
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
                <td>{u.email}</td>
                <td><span className={styles.badgeRole}>{u.role}</span></td>
                <td>
                  {u.is_active
                    ? <span className={styles.badgeActive}>Aktif</span>
                    : <span className={styles.badgeInactive}>Nonaktif</span>}
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td>
                  {u.is_active ? (
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
  const [books, setBooks]         = useState<AdminBook[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState<number | null>(null);
  const [generating, setGenerating] = useState<number | null>(null);

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

  const generatePreview = async (id: number) => {
    setGenerating(id);
    try {
      await apiClient.post(`/admin/books/${id}/generate-preview`, {});
      toast.success('Preview sedang di-generate, refresh setelah beberapa detik');
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal generate preview');
    } finally { setGenerating(null); }
  };

  return (
    <>
      <div className={styles.toolbar}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {books.length} buku ditemukan
        </span>
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
                  <div style={{ fontWeight: 500 }}>{b.publisher?.full_name ?? '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.publisher?.email ?? ''}</div>
                </td>
                <td><span className={styles.badgeRole}>{formatLabel(b.format)}</span></td>
                <td>{formatPrice(b.price)}</td>
                <td>
                  {b.is_withdrawn
                    ? <span className={styles.badgeInactive}>Ditarik Publisher</span>
                    : b.lcp_content_id
                      ? <span className={styles.badgeActive}>Terenkripsi LCP</span>
                      : <span className={styles.badgePending}>Belum Dienkripsi</span>}
                </td>
                <td><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className={`${styles.actionBtn} ${styles.btnDanger}`}
                    onClick={() => deleteBook(b.ID, b.title)}
                    disabled={busy === b.ID}
                  >
                    Hapus
                  </button>
                </div></td>
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

  const statusBadge = (s: string) => {
    if (s === 'success') return <span className={styles.badgeSuccess}>Sukses</span>;
    if (s === 'failed')  return <span className={styles.badgeFailed}>Gagal</span>;
    return <span className={styles.badgePending}>Pending</span>;
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
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {txs.length} transaksi ditemukan
        </span>
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
                <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                  {tx.midtrans_order_id || `#${tx.ID}`}
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{tx.user?.full_name ?? '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.user?.email ?? ''}</div>
                </td>
                <td style={{ maxWidth: 200 }}>{tx.book?.title ?? '—'}</td>
                <td>{statusBadge(tx.status)}</td>
                <td>{formatDate(tx.CreatedAt)}</td>
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
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1>Panel Admin</h1>
        <p>Kelola user, buku, dan transaksi platform ITSPress.</p>
      </div>

      <div className={styles.tabs}>
        {(['users', 'books', 'transactions'] as Tab[]).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'users' ? 'Users' : t === 'books' ? 'Semua Buku' : 'Transaksi'}
          </button>
        ))}
      </div>

      {tab === 'users'        && <UsersTab />}
      {tab === 'books'        && <BooksTab />}
      {tab === 'transactions' && <TransactionsTab />}
    </div>
  );
}
