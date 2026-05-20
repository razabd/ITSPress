'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/api';
import PasswordInput from '@/components/PasswordInput';
import toast from 'react-hot-toast';
import authStyles from '../login/page.module.css';
import styles from './page.module.css';

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
    <div className={authStyles.authWrapper}>
      <div className={authStyles.authCard}>
        <div className={authStyles.body}>
          <div className={authStyles.header}>
            <h1>Setup LCP Passphrase</h1>
            <p>Buat passphrase untuk membuka e-book di Thorium Reader</p>
          </div>

          <p className={styles.hint}>
            Passphrase digunakan setiap kali membuka e-book di Thorium Reader. Bisa diubah kapan saja di <strong>Pengaturan</strong>, namun file <strong>.lcpl</strong> yang sudah diunduh perlu diunduh ulang.
          </p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} className={authStyles.form}>
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
