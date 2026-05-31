'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getHomeRoute } from '@/lib/redirect';
import PasswordInput from '@/components/PasswordInput';
import toast from 'react-hot-toast';
import styles from '../login/page.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const { user, isLoading, needsPassphrase } = useAuth();

  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getHomeRoute(user, needsPassphrase));
    }
  }, [user, isLoading, needsPassphrase, router]);

  if (isLoading || user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) {
      setError('min. 6 karakter');
      return;
    }
    if (form.password !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await apiClient.post('/auth/register', form);
      if (res.needs_verify) {
        setRegistered(true);
      } else {
        toast.success('Akun berhasil dibuat! Silakan login.');
        router.push('/login');
      }
    } catch (err: unknown) {
      setError((err as { error?: string })?.error || 'Registrasi gagal');
    } finally { setLoading(false); }
  };

  if (registered) {
    return (
      <div className={styles.authWrapper}>
        <div className={styles.authCard}>

          <div className={styles.body}>
            <div className={styles.header}>
              <h1>Cek Email Anda</h1>
              <p>Satu langkah lagi untuk mengaktifkan akun</p>
            </div>
            <div className="alert alert-success" style={{ marginBottom: 20, lineHeight: 1.7 }}>
              Email verifikasi telah dikirim ke <strong>{form.email}</strong>.
              Klik link di email tersebut untuk mengaktifkan akun Anda.
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Tidak menemukan email? Periksa folder <strong>Spam</strong> atau <strong>Promotions</strong>.
            </p>
            <p className={styles.footer} style={{ marginTop: 20 }}>
              Sudah verifikasi? <Link href="/login">Masuk di sini</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard} style={{ maxWidth: 480 }}>

        <div className={styles.body}>
          <div className={styles.header}>
            <h1>Buat Akun</h1>
            <p>Bergabung dengan platform distribusi ITSPress</p>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label className="form-label">Nama Lengkap</label>
              <input
                type="text"
                className="form-input"
                placeholder="Nama Anda"
                value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="email@its.ac.id"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Password{' '}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(min. 6 karakter)</span>
              </label>
              <PasswordInput
                value={form.password}
                onChange={v => setForm({ ...form, password: v })}
                placeholder="Buat password yang kuat"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Konfirmasi Password</label>
              <PasswordInput
                value={confirmPassword}
                onChange={v => setConfirmPassword(v)}
                placeholder="Ulangi password Anda"
                required
              />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55, padding: '10px 13px', background: 'var(--its-navy-pale)', borderRadius: 8 }}>
              Setelah verifikasi email, Anda akan diminta membuat <strong>LCP Passphrase</strong> — PIN untuk membuka e-book di Thorium Reader.
            </p>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Buat Akun'}
            </button>
          </form>

          <p className={styles.footer}>
            Sudah punya akun? <Link href="/login">Masuk di sini</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
