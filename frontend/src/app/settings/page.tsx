'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';
import ConfirmModal from '@/components/ConfirmModal';
import toast from 'react-hot-toast';
import styles from './page.module.css';

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionMeta}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description && <p className={styles.sectionDesc}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwConfirmOpen, setPwConfirmOpen] = useState(false);

  const [ppForm, setPpForm] = useState({ next: '', confirm: '' });
  const [ppLoading, setPpLoading] = useState(false);
  const [ppConfirmOpen, setPpConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      toast.error('Password baru dan konfirmasi tidak cocok!'); return;
    }
    if (pwForm.next.length < 6) {
      toast.error('Password baru minimal 6 karakter!'); return;
    }
    setPwConfirmOpen(true);
  };

  const confirmChangePassword = async () => {
    setPwConfirmOpen(false);
    setPwLoading(true);
    try {
      const res = await apiClient.put('/auth/password', {
        current_password: pwForm.current,
        new_password: pwForm.next,
      });
      toast.success(res.message || 'Password berhasil diubah! Silakan login kembali.');
      logout();
      router.push('/login');
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal mengubah password');
    } finally { setPwLoading(false); }
  };

  const handleChangePassphrase = (e: React.FormEvent) => {
    e.preventDefault();
    if (ppForm.next !== ppForm.confirm) {
      toast.error('LCP Passphrase baru dan konfirmasi tidak cocok!'); return;
    }
    setPpConfirmOpen(true);
  };

  const confirmChangePassphrase = async () => {
    setPpConfirmOpen(false);
    setPpLoading(true);
    try {
      const res = await apiClient.put('/auth/passphrase', { new_passphrase: ppForm.next });
      toast.success(res.message || 'LCP Passphrase berhasil diubah!');
      setPpForm({ next: '', confirm: '' });
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal mengubah passphrase');
    } finally { setPpLoading(false); }
  };

  if (isLoading || !user) return (
    <div className="container">
      <div className={styles.loading}><span className="spinner" /></div>
    </div>
  );

  return (
    <>
      <ConfirmModal
        open={pwConfirmOpen}
        title="Ubah Password?"
        message="Password akun Anda akan diubah. Anda akan tetap login di perangkat ini."
        confirmLabel="Ya, Ubah Password"
        loading={pwLoading}
        onConfirm={confirmChangePassword}
        onCancel={() => setPwConfirmOpen(false)}
      />
      <ConfirmModal
        open={ppConfirmOpen}
        title="Ubah LCP Passphrase?"
        message="Semua file lisensi (.lcpl) Anda akan diperbarui otomatis. Anda harus mendownload ulang file .lcpl dan memasukkan passphrase baru di Thorium Reader."
        confirmLabel="Ya, Ubah Passphrase"
        loading={ppLoading}
        onConfirm={confirmChangePassphrase}
        onCancel={() => setPpConfirmOpen(false)}
      />

      {/* ── Settings Hero ── */}
      <div className={styles.settingsHero}>
        <div className={styles.settingsHeroOverlay} />
        <div className={styles.settingsHeroGlow} />
        <div className="container">
          <div className={styles.settingsHeroInner}>
            <p className={styles.settingsLabel}>Pengaturan Akun</p>
            <h1 className={styles.settingsName}>{user.name}</h1>
            <p className={styles.settingsEmail}>{user.email}</p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="container">
        <div className={styles.settingsContent}>

          <Section title="Ubah Password">
            <div className={`card ${styles.formCard}`}>
              <form onSubmit={handleChangePassword} className={styles.form}>
                <div className="form-group">
                  <label className="form-label">Password Saat Ini</label>
                  <PasswordInput
                    value={pwForm.current}
                    onChange={v => setPwForm(f => ({ ...f, current: v }))}
                    placeholder="Masukkan password saat ini"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Password Baru{' '}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(min. 6 karakter)</span>
                  </label>
                  <PasswordInput
                    value={pwForm.next}
                    onChange={v => setPwForm(f => ({ ...f, next: v }))}
                    placeholder="Password baru"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Konfirmasi Password Baru</label>
                  <PasswordInput
                    value={pwForm.confirm}
                    onChange={v => setPwForm(f => ({ ...f, confirm: v }))}
                    placeholder="Ulangi password baru"
                    required
                  />
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                    {pwLoading ? <span className="spinner" /> : 'Simpan Password'}
                  </button>
                </div>
              </form>
            </div>
          </Section>

          {user.role === 'pelanggan' && (
            <Section title="LCP Passphrase">
              <div className={`card ${styles.formCard}`}>
                <p className={styles.infoNote}>
                  Perhatian: Setelah passphrase diubah, Anda harus download ulang semua file .lcpl dan membuka kembali e-book di Thorium Reader dengan passphrase yang baru.
                </p>
                <form onSubmit={handleChangePassphrase} className={styles.form}>
                  <div className="form-group">
                    <label className="form-label">LCP Passphrase Baru</label>
                    <PasswordInput
                      value={ppForm.next}
                      onChange={v => setPpForm(f => ({ ...f, next: v }))}
                      placeholder="Passphrase baru untuk Thorium Reader"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Konfirmasi LCP Passphrase Baru</label>
                    <PasswordInput
                      value={ppForm.confirm}
                      onChange={v => setPpForm(f => ({ ...f, confirm: v }))}
                      placeholder="Ulangi passphrase baru"
                      required
                    />
                  </div>
                  <div className={styles.formActions}>
                    <button type="submit" className="btn btn-primary" disabled={ppLoading}>
                      {ppLoading ? <span className="spinner" /> : 'Simpan Passphrase'}
                    </button>
                  </div>
                </form>
              </div>
            </Section>
          )}

        </div>
      </div>
    </>
  );
}
