'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { getHomeRoute } from '@/lib/redirect';
import PasswordInput from '@/components/PasswordInput';
import toast from 'react-hot-toast';
import styles from './page.module.css';

export default function LoginPage() {
  const { login, user, isLoading, needsPassphrase } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [disabled, setDisabled] = useState(false);
  const [unverified, setUnverified] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getHomeRoute(user, needsPassphrase));
    }
  }, [user, isLoading, needsPassphrase, router]);

  if (isLoading || user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setDisabled(false); setUnverified(false);
    try {
      await login(email, password);
      toast.success('Berhasil masuk!');
    } catch (err: unknown) {
      const e = err as { error?: string; disabled?: boolean; unverified?: boolean };
      if (e?.disabled) {
        setDisabled(true);
      } else if (e?.unverified) {
        setUnverified(true);
      } else {
        setError(e?.error || 'Login gagal. Periksa email dan password Anda.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>

        <div className={styles.body}>
          <div className={styles.header}>
            <h1>{t('login.title')}</h1>
            <p>{t('login.subtitle')}</p>
          </div>

          {disabled && (
            <div className="alert alert-error" style={{ marginBottom: 16, lineHeight: 1.6 }}>
              <strong>Akun Anda telah dinonaktifkan.</strong><br />
              Hubungi kami di{' '}
              <a href="mailto:itspress@gmail.com" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
                itspress@gmail.com
              </a>{' '}
              untuk informasi lebih lanjut.
            </div>
          )}
          {unverified && (
            <div className="alert alert-error" style={{ marginBottom: 16, lineHeight: 1.6 }}>
              <strong>Email belum diverifikasi.</strong><br />
              Cek inbox atau folder Spam, lalu klik link verifikasi yang dikirim saat pendaftaran.
            </div>
          )}
          {!disabled && !unverified && error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label className="form-label">{t('login.emailLabel')}</label>
              <input
                type="email"
                className="form-input"
                placeholder="email@its.ac.id"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">{t('login.passwordLabel')}</label>
                <Link href="/forgot-password" style={{ fontSize: '0.75rem', color: 'var(--its-navy)', fontWeight: 500 }}>
                  {t('login.forgotPw')}
                </Link>
              </div>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder={t('login.passwordPh')}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : t('login.submitBtn')}
            </button>
          </form>

          <p className={styles.footer}>
            {t('login.footer')} <Link href="/register">{t('login.footerLink')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
