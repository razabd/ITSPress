'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/api';
import PasswordInput from '@/components/PasswordInput';
import toast from 'react-hot-toast';
import styles from '../login/page.module.css';

export default function SetupPassphrasePage() {
  const { user, isLoading, passphraseSetupDone } = useAuth();
  const router = useRouter();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
    if (!isLoading && user && user.role !== 'pelanggan') router.replace('/');
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase !== confirm) {
      setError('Konfirmasi passphrase tidak cocok.');
      return;
    }
    if (passphrase.length < 4) {
      setError('Passphrase minimal 4 karakter.');
      return;
    }
    setLoading(true); setError('');
    try {
      await apiClient.put('/auth/passphrase', { new_passphrase: passphrase });
      toast.success('LCP Passphrase berhasil disimpan!');
      passphraseSetupDone();
    } catch (err: unknown) {
      setError((err as { error?: string })?.error || 'Gagal menyimpan passphrase.');
    } finally { setLoading(false); }
  };

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>
        <div className={styles.topBar} />
        <div className={styles.body}>
          <div className={styles.header}>
            <h1>Setup LCP Passphrase</h1>
            <p>Buat PIN untuk membuka e-book di Thorium Reader</p>
          </div>

          <div style={{ background: 'var(--its-navy-pale)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Passphrase ini digunakan setiap kali membuka e-book di Thorium Reader. Anda bisa mengubahnya kapan saja di halaman <strong>Pengaturan</strong>, namun semua file <strong>.lcpl</strong> yang sudah diunduh harus diunduh ulang setelahnya.
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label className="form-label">LCP Passphrase</label>
              <PasswordInput
                value={passphrase}
                onChange={setPassphrase}
                placeholder="Buat passphrase yang mudah diingat"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Konfirmasi Passphrase</label>
              <PasswordInput
                value={confirm}
                onChange={setConfirm}
                placeholder="Ulangi passphrase"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Simpan & Lanjut ke Dashboard'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
