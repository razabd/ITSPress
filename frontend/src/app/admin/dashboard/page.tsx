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
  approval_status: string;
  approval_note?: string;
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

interface PendingPublisher {
  id: number;
  full_name: string;
  email: string;
  approval_status: string;
  has_declaration: boolean;
  created_at: string;
}

type Tab = 'users' | 'books' | 'transactions' | 'publishers' | 'bookApproval';

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
                <td style={{ display: 'flex', gap: 6 }}>
                  {b.lcp_content_id && (
                    <button
                      className={styles.actionBtn}
                      onClick={() => generatePreview(b.ID)}
                      disabled={generating === b.ID}
                      title={`Preview: ${b.preview_page_count ?? 0} hal`}
                    >
                      {generating === b.ID ? '...' : `Preview (${b.preview_page_count ?? 0})`}
                    </button>
                  )}
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

function PublishersTab() {
  const [publishers, setPublishers] = useState<PendingPublisher[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: number; name: string } | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get('/admin/publishers/pending')
      .then(d => setPublishers(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: number) => {
    if (!confirm('Setujui publisher ini?')) return;
    setBusy(id);
    try {
      await apiClient.post(`/admin/publishers/${id}/approve`, {});
      toast.success('Publisher disetujui');
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal');
    } finally { setBusy(null); }
  };

  const openRejectModal = (id: number, name: string) => {
    setRejectNote('');
    setRejectModal({ id, name });
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    setBusy(rejectModal.id);
    try {
      await apiClient.post(`/admin/publishers/${rejectModal.id}/reject`, { note: rejectNote });
      toast.success('Publisher ditolak');
      setRejectModal(null);
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal');
    } finally { setBusy(null); }
  };

  const downloadDeclaration = (id: number) => {
    apiClient.downloadFile(`/admin/publishers/${id}/declaration`, `surat_pernyataan_${id}.pdf`);
  };

  return (
    <>
      {rejectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 14, padding: '28px 28px 24px',
            width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-md)',
          }}>
            <h3 style={{ marginBottom: 8, fontSize: '1rem' }}>Tolak Publisher</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Pendaftaran <strong>{rejectModal.name}</strong> akan ditolak. Tulis alasan penolakan (opsional):
            </p>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Alasan penolakan..."
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              style={{ marginBottom: 16, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className={`${styles.actionBtn}`} onClick={() => setRejectModal(null)}>
                Batal
              </button>
              <button
                className={`${styles.actionBtn} ${styles.btnDanger}`}
                onClick={confirmReject}
                disabled={busy === rejectModal.id}
              >
                {busy === rejectModal.id ? 'Memproses...' : 'Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.toolbar}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {publishers.length} publisher menunggu persetujuan
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Surat Pernyataan</th>
              <th>Terdaftar</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.emptyRow}><td colSpan={5}>Memuat data...</td></tr>
            ) : publishers.length === 0 ? (
              <tr className={styles.emptyRow}><td colSpan={5}>Tidak ada publisher yang menunggu persetujuan.</td></tr>
            ) : publishers.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.full_name}</td>
                <td>{p.email}</td>
                <td>
                  {p.has_declaration ? (
                    <button
                      className={styles.actionBtn}
                      onClick={() => downloadDeclaration(p.id)}
                      style={{ fontSize: '0.78rem' }}
                    >
                      Unduh PDF
                    </button>
                  ) : (
                    <span className={styles.badgeInactive}>Belum diupload</span>
                  )}
                </td>
                <td>{formatDate(p.created_at)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button
                    className={`${styles.actionBtn} ${styles.btnSuccess}`}
                    onClick={() => approve(p.id)}
                    disabled={busy === p.id}
                  >
                    Setujui
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.btnDanger}`}
                    onClick={() => openRejectModal(p.id, p.full_name)}
                    disabled={busy === p.id}
                  >
                    Tolak
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

function BookApprovalTab() {
  const [books, setBooks]     = useState<AdminBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: number; title: string } | null>(null);
  const [rejectNote, setRejectNote]   = useState('');
  const [reviewBook, setReviewBook]   = useState<AdminBook | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get('/admin/books/pending')
      .then(d => setBooks(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: number) => {
    setBusy(id);
    try {
      await apiClient.post(`/admin/books/${id}/approve`, {});
      toast.success('Buku disetujui dan sedang dienkripsi otomatis');
      setReviewBook(null);
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal menyetujui buku');
    } finally { setBusy(null); }
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    setBusy(rejectModal.id);
    try {
      await apiClient.post(`/admin/books/${rejectModal.id}/reject`, { note: rejectNote });
      toast.success('Buku ditolak');
      setRejectModal(null);
      load();
    } catch (e: unknown) {
      toast.error((e as { error?: string })?.error || 'Gagal menolak buku');
    } finally { setBusy(null); }
  };

  const downloadRaw = async (b: AdminBook) => {
    setDownloading(true);
    try {
      await apiClient.downloadFile(`/admin/books/${b.ID}/raw`, `tinjauan_${b.title}.${b.format}`);
    } catch {
      toast.error('Gagal mengunduh file buku');
    } finally { setDownloading(false); }
  };

  const openReject = (b: AdminBook) => {
    setRejectNote('');
    setReviewBook(null);
    setRejectModal({ id: b.ID, title: b.title });
  };

  return (
    <>
      {/* Modal Tolak */}
      {rejectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 14, padding: '28px 28px 24px',
            width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-md)',
          }}>
            <h3 style={{ marginBottom: 8, fontSize: '1rem' }}>Tolak Buku</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Buku <strong>"{rejectModal.title}"</strong> akan ditolak. Tulis alasan penolakan (opsional):
            </p>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Alasan penolakan..."
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              style={{ marginBottom: 16, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className={styles.actionBtn} onClick={() => setRejectModal(null)}>Batal</button>
              <button
                className={`${styles.actionBtn} ${styles.btnDanger}`}
                onClick={confirmReject}
                disabled={busy === rejectModal.id}
              >
                {busy === rejectModal.id ? 'Memproses...' : 'Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tinjau */}
      {reviewBook && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '16px',
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 16, width: '100%', maxWidth: 680,
            maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-md)',
          }}>
            {/* Header modal */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Tinjau Buku</h3>
              <button
                onClick={() => setReviewBook(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Konten modal */}
            <div style={{ padding: '20px 24px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {/* Cover */}
              <div style={{ flexShrink: 0 }}>
                {reviewBook.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`http://localhost:8081${reviewBook.cover_url}`}
                    alt="Cover"
                    style={{ width: 130, height: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div style={{
                    width: 130, height: 180, borderRadius: 8, background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center',
                  }}>
                    Tidak ada<br/>cover
                  </div>
                )}
              </div>

              {/* Detail buku */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {reviewBook.title}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {reviewBook.publisher?.full_name ?? '—'}
                  {reviewBook.publisher?.email ? ` · ${reviewBook.publisher.email}` : ''}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span className={styles.badgeRole}>{formatLabel(reviewBook.format)}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {formatPrice(reviewBook.price)}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Diunggah {formatDate(reviewBook.CreatedAt)}
                  </span>
                </div>
                {reviewBook.description && (
                  <div style={{
                    fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6,
                    background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px',
                    maxHeight: 140, overflow: 'auto',
                  }}>
                    {reviewBook.description}
                  </div>
                )}
                {!reviewBook.description && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Tidak ada deskripsi.
                  </p>
                )}
              </div>
            </div>

            {/* Footer aksi */}
            <div style={{
              padding: '16px 24px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
            }}>
              <button
                className={styles.actionBtn}
                onClick={() => downloadRaw(reviewBook)}
                disabled={downloading}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {downloading ? 'Mengunduh...' : 'Unduh File untuk Ditinjau'}
              </button>
              <div style={{ flex: 1 }} />
              <button
                className={`${styles.actionBtn} ${styles.btnSuccess}`}
                onClick={() => approve(reviewBook.ID)}
                disabled={busy === reviewBook.ID}
              >
                {busy === reviewBook.ID ? 'Memproses...' : 'Setujui'}
              </button>
              <button
                className={`${styles.actionBtn} ${styles.btnDanger}`}
                onClick={() => openReject(reviewBook)}
                disabled={busy === reviewBook.ID}
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.toolbar}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {books.length} buku menunggu persetujuan
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
              <th>Diunggah</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Memuat data...</td></tr>
            ) : books.length === 0 ? (
              <tr className={styles.emptyRow}><td colSpan={6}>Tidak ada buku yang menunggu persetujuan.</td></tr>
            ) : books.map(b => (
              <tr key={b.ID}>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 220 }}>{b.title}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{b.publisher?.full_name ?? '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.publisher?.email ?? ''}</div>
                </td>
                <td><span className={styles.badgeRole}>{formatLabel(b.format)}</span></td>
                <td>{formatPrice(b.price)}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(b.CreatedAt)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button
                    className={styles.actionBtn}
                    onClick={() => setReviewBook(b)}
                  >
                    Tinjau
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.btnSuccess}`}
                    onClick={() => approve(b.ID)}
                    disabled={busy === b.ID}
                  >
                    {busy === b.ID ? '...' : 'Setujui'}
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.btnDanger}`}
                    onClick={() => openReject(b)}
                    disabled={busy === b.ID}
                  >
                    Tolak
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
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1>Panel Admin</h1>
        <p>Kelola user, buku, dan transaksi platform ITSPress.</p>
      </div>

      <div className={styles.tabs}>
        {(['users', 'publishers', 'bookApproval', 'books', 'transactions'] as Tab[]).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'users'         ? 'Users'
             : t === 'publishers'  ? 'Approval Publisher'
             : t === 'bookApproval'? 'Approval Buku'
             : t === 'books'       ? 'Semua Buku'
             : 'Transaksi'}
          </button>
        ))}
      </div>

      {tab === 'users'         && <UsersTab />}
      {tab === 'publishers'    && <PublishersTab />}
      {tab === 'bookApproval'  && <BookApprovalTab />}
      {tab === 'books'         && <BooksTab />}
      {tab === 'transactions'  && <TransactionsTab />}
    </div>
  );
}
