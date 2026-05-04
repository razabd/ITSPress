'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { Book } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import styles from '../../dashboard/page.module.css';
import { formatLabel } from '@/lib/format';


export default function PublisherDashboardPage() {
  const { user, isLoading } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  const [myBooks, setMyBooks] = useState<Book[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [encrypting, setEncrypting] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: '', description: '', format: 'epub', price: '0' });
  const backendBase = API_BASE_URL.replace(/\/api\/v1$/, '');

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'publisher') {
      router.replace('/login');
      return;
    }
    // Redirect publisher yang belum approved ke halaman sesuai statusnya
    if (user.approval_status === 'draft') {
      router.replace('/publisher/complete-profile');
      return;
    }
    if (user.approval_status === 'pending' || user.approval_status === 'rejected') {
      router.replace('/publisher/pending');
      return;
    }
    apiClient.get('/books/my')
      .then(d => setMyBooks(d.data || []))
      .finally(() => setLoadingData(false));
  }, [user, isLoading, router]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) { toast.error('Pilih file e-book terlebih dahulu'); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', fileRef.current.files[0]);
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('format', form.format);
    fd.append('price', form.price);
    if (coverRef.current?.files?.[0]) fd.append('cover', coverRef.current.files[0]);
    try {
      await apiClient.postForm('/books', fd);
      toast.success('E-book berhasil diunggah! Klik "Enkripsi LCP" untuk mengaktifkan perlindungan DRM.');
      setForm({ title: '', description: '', format: 'epub', price: '0' });
      if (fileRef.current) fileRef.current.value = '';
      if (coverRef.current) coverRef.current.value = '';
      const fresh = await apiClient.get('/books/my');
      setMyBooks(fresh.data || []);
    } catch (err: unknown) {
      const msg = (err as { error?: string })?.error || 'Upload gagal';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleEncrypt = async (bookId: number) => {
    setEncrypting(bookId);
    try {
      await apiClient.post(`/books/${bookId}/encrypt`, {});
      toast.success('Buku berhasil dienkripsi dengan LCP!');
      const fresh = await apiClient.get('/books/my');
      setMyBooks(fresh.data || []);
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Enkripsi gagal');
    } finally {
      setEncrypting(null);
    }
  };

  if (isLoading || loadingData) return (
    <div className="container"><div className={styles.loading}><span className="spinner" /></div></div>
  );

  return (
    <div className="container">
      <div className="page-header">
        <h1>{t('publisher.title')}</h1>
        <p>{t('publisher.subtitle')} <strong>{user?.name}</strong>.</p>
      </div>

      {/* Upload Form */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('publisher.uploadSection')}</h2>
        <div className="card">
          <form onSubmit={handleUpload} className={styles.uploadForm}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">{t('publisher.form.titleLabel')}</label>
                <input type="text" className="form-input" placeholder={t('publisher.form.titlePh')}
                  value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">{t('publisher.form.format')}</label>
                <select className="form-input" value={form.format}
                  onChange={e => setForm({ ...form, format: e.target.value })}>
                  <option value="epub">EPUB</option>
                  <option value="pdf">PDF</option>
                  <option value="audiobook">Audiobook LCP (.audiobook)</option>
                  <option value="divina">Divina (.divina)</option>
                  <option value="lpf">Lightweight Packaging (.lpf)</option>
                  <option value="webpub">Web Publication (.webpub)</option>
                  <option value="rpf">Readium Package (.rpf)</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('publisher.form.desc')}</label>
              <textarea className="form-input" rows={3} placeholder={t('publisher.form.descPh')}
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">{t('publisher.form.price')}</label>
                <input type="number" min="0" className="form-input"
                  value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('publisher.form.file')}</label>
                <input type="file" accept=".epub,.pdf,.audiobook,.divina,.lpf,.webpub,.rpf" className="form-input" ref={fileRef} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                {t('publisher.form.cover')}{' '}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('publisher.form.coverOpt')}</span>
              </label>
              <input type="file" accept=".jpg,.jpeg,.png,.webp" className="form-input" ref={coverRef} />
              {form.format === 'pdf' && (
                <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {t('publisher.form.coverNote')}
                </p>
              )}
              {!['epub', 'pdf'].includes(form.format) && (
                <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Format ini tidak memiliki cover otomatis — upload gambar cover manual di atas (opsional).
                </p>
              )}
            </div>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading
                ? <><span className="spinner" /> {t('publisher.form.uploading')}</>
                : t('publisher.form.uploadBtn')}
            </button>
          </form>
        </div>
      </section>

      {/* Book List */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('publisher.myBooksSection')} ({myBooks.length})</h2>
        {myBooks.length === 0 ? (
          <div className="empty-state">
            <h3>{t('publisher.emptyTitle')}</h3>
            <p>{t('publisher.emptySub')}</p>
          </div>
        ) : (
          <div className={styles.list}>
            {myBooks.map(book => (
              <div key={book.ID} className={`card ${styles.itemCard} ${book.lcp_content_id ? styles.itemCardActive : styles.itemCardPending}`}>
                {book.cover_url && (
                  <img
                    src={`${backendBase}${book.cover_url}`}
                    alt={book.title}
                    style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                  />
                )}
                <div className={styles.itemInfo}>
                  <p className={styles.itemTitle}>{book.title}</p>
                  <p className={styles.itemMeta}>
                    {formatLabel(book.format)} · {book.price === 0 ? t('publisher.free') : `Rp ${book.price.toLocaleString('id-ID')}`}
                    {book.lcp_content_id && ` · ${book.lcp_content_id.slice(0, 16)}...`}
                    <span className={styles.statusDot} style={{ background: book.lcp_content_id ? 'var(--success)' : 'var(--warning)' }} />
                    <span className={`${styles.statusText} ${book.lcp_content_id ? styles.statusTextActive : styles.statusTextPending}`}>
                      {book.lcp_content_id ? t('publisher.status.encrypted') : t('publisher.status.pending')}
                    </span>
                  </p>
                </div>
                {!book.lcp_content_id && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleEncrypt(book.ID)}
                    disabled={encrypting === book.ID}
                  >
                    {encrypting === book.ID ? <span className="spinner" /> : t('publisher.encryptBtn')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
