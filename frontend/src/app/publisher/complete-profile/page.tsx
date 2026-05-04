'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';
import styles from '../../login/page.module.css';

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, isLoading, logout, refreshUser } = useAuth();
  const { t } = useLang();

  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'publisher') { router.replace('/'); return; }
    if (user.approval_status === 'approved' || user.approval_status === '') {
      router.replace('/publisher/dashboard');
      return;
    }
    // pending → halaman tunggu (bukan rejected, karena rejected boleh re-upload di sini)
    if (user.approval_status === 'pending') {
      router.replace('/publisher/pending');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  const isReupload = user.approval_status === 'rejected';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('Format file harus PDF.');
      setFile(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Ukuran file maksimal 5 MB.');
      setFile(null);
      return;
    }
    setError('');
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Pilih file PDF terlebih dahulu.'); return; }
    setSubmitting(true); setError('');

    const formData = new FormData();
    formData.append('declaration', file);

    try {
      await apiClient.postForm('/publisher/declaration', formData);
      toast.success('Surat pernyataan berhasil dikirim! Menunggu tinjauan admin.');
      await refreshUser();
      router.replace('/publisher/pending');
    } catch (err: unknown) {
      setError((err as { error?: string })?.error || 'Gagal mengupload file. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard} style={{ maxWidth: 500 }}>
        <div className={styles.topBar} />
        <div className={styles.body}>
          <div className={styles.header}>
            <h1>{isReupload ? 'Upload Ulang Surat Pernyataan' : t('completeProfile.title')}</h1>
            <p>{isReupload ? 'Kirim surat pernyataan baru untuk ditinjau kembali oleh admin' : t('completeProfile.subtitle')}</p>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label className="form-label">{t('completeProfile.fileLabel')}</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 10,
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: file ? 'var(--its-navy-pale)' : 'var(--bg-page)',
                  transition: 'background 0.2s',
                }}
              >
                {file ? (
                  <p style={{ margin: 0, color: 'var(--its-navy)', fontWeight: 500, fontSize: '0.9rem' }}>
                    📄 {file.name}
                  </p>
                ) : (
                  <>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                      Klik untuk memilih file
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {t('completeProfile.fileHint')}
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>

            <div style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              padding: '10px 12px',
              background: 'var(--its-navy-pale)',
              borderRadius: 8,
              marginBottom: 4,
            }}>
              <strong>{t('completeProfile.whyTitle')}</strong>
              <br />
              {t('completeProfile.whyBody')}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={submitting || !file}>
              {submitting ? <span className="spinner" /> : t('completeProfile.submitBtn')}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.82rem' }}>
            <button
              onClick={logout}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Keluar dari akun ini
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
