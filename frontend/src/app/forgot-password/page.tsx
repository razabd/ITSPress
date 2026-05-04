'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getHomeRoute } from '@/lib/redirect';
import { useLang } from '@/context/LangContext';
import { apiClient } from '@/lib/api';
import styles from '../login/page.module.css';

export default function ForgotPasswordPage() {
  const { t } = useLang();
  const { user, isLoading, needsPassphrase } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getHomeRoute(user, needsPassphrase));
    }
  }, [user, isLoading, needsPassphrase, router]);

  if (isLoading || user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: unknown) {
      setError((err as { error?: string })?.error || 'Terjadi kesalahan. Coba lagi nanti.');
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
            <h1>{t('forgotpw.title')}</h1>
            <p>{t('forgotpw.subtitle')}</p>
          </div>

          {submitted ? (
            <div>
              <div className="alert alert-success" style={{ marginBottom: 20 }}>
                {t('forgotpw.successMsg')}
              </div>
              <p className={styles.footer}>
                {t('forgotpw.backLogin')}{' '}
                <Link href="/login">{t('forgotpw.backLoginLink')}</Link>
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
                  <label className="form-label">{t('forgotpw.emailLabel')}</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="email@its.ac.id"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={loading}
                >
                  {loading ? <span className="spinner" /> : t('forgotpw.submitBtn')}
                </button>
              </form>
              <p className={styles.footer}>
                {t('forgotpw.backLogin')}{' '}
                <Link href="/login">{t('forgotpw.backLoginLink')}</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
