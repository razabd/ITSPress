'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/context/LangContext';
import { apiClient } from '@/lib/api';
import PasswordInput from '@/components/PasswordInput';
import styles from '../login/page.module.css';

function ResetPasswordForm() {
  const { t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError(t('resetpw.invalidToken'));
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError(t('resetpw.mismatch'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/reset-password', { token, new_password: newPassword });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      setError((err as { error?: string })?.error || t('resetpw.invalidToken'));
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
            <h1>{t('resetpw.title')}</h1>
            <p>{t('resetpw.subtitle')}</p>
          </div>

          {success ? (
            <div>
              <div className="alert alert-success" style={{ marginBottom: 20 }}>
                {t('resetpw.successMsg')}
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
                  <label className="form-label">{t('resetpw.newPwLabel')}</label>
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder={t('resetpw.newPwPh')}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('resetpw.confirmLabel')}</label>
                  <PasswordInput
                    value={confirm}
                    onChange={setConfirm}
                    placeholder={t('resetpw.confirmPh')}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={loading || !token}
                >
                  {loading ? <span className="spinner" /> : t('resetpw.submitBtn')}
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
