'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import PasswordInput from '@/components/PasswordInput';
import styles from '../login/page.module.css';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Link reset tidak valid atau sudah kadaluarsa.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/reset-password', { token, new_password: newPassword });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      setError((err as { error?: string })?.error || 'Link reset tidak valid atau sudah kadaluarsa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>
        <div className={styles.topBar} />
        <div className={styles.body}>
          <div className={styles.header}>
            <h1>Reset Password</h1>
            <p>Masukkan password baru Anda</p>
          </div>

          {success ? (
            <div>
              <div className="alert alert-success" style={{ marginBottom: 20 }}>
                Password berhasil direset. Silakan masuk dengan password baru Anda.
              </div>
              <p className={styles.footer} style={{ textAlign: 'center' }}>
                Mengalihkan ke halaman login...
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className="form-group">
                  <label className="form-label">Password Baru</label>
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="Minimal 6 karakter"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Konfirmasi Password Baru</label>
                  <PasswordInput
                    value={confirm}
                    onChange={setConfirm}
                    placeholder="Ulangi password baru"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={loading || !token}
                >
                  {loading ? <span className="spinner" /> : 'Reset Password'}
                </button>
              </form>
              <p className={styles.footer}>
                <Link href="/login">Kembali ke halaman Masuk</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
