'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';
import toast from 'react-hot-toast';
import styles from './page.module.css';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const { t } = useLang();
  const router = useRouter();

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);

  const [ppForm, setPpForm] = useState({ next: '', confirm: '' });
  const [ppLoading, setPpLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      toast.error('Password baru dan konfirmasi tidak cocok!'); return;
    }
    if (pwForm.next.length < 6) {
      toast.error('Password baru minimal 6 karakter!'); return;
    }
    setPwLoading(true);
    try {
      const res = await apiClient.put('/auth/password', {
        current_password: pwForm.current,
        new_password: pwForm.next,
      });
      toast.success(res.message || 'Password berhasil diubah!');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: unknown) {
      toast.error((err as { error?: string })?.error || 'Gagal mengubah password');
    } finally { setPwLoading(false); }
  };

  const handleChangePassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ppForm.next !== ppForm.confirm) {
      toast.error('LCP Passphrase baru dan konfirmasi tidak cocok!'); return;
    }
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
    <div className="container"><div className={styles.loading}><span className="spinner" /></div></div>
  );

  return (
    <div className="container">
      <div className="page-header">
        <h1>{t('settings.title')}</h1>
        <p>{user.name} &mdash; {user.email}</p>
      </div>

      <Section title={t('settings.changePw')}>
        <div className={`card ${styles.formCard}`}>
          <form onSubmit={handleChangePassword} className={styles.form}>
            <div className="form-group">
              <label className="form-label">{t('settings.currentPw')}</label>
              <PasswordInput value={pwForm.current} onChange={v => setPwForm(f => ({ ...f, current: v }))}
                placeholder={t('settings.currentPwPh')} required />
            </div>
            <div className="form-group">
              <label className="form-label">
                {t('settings.newPw')}{' '}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('settings.newPwHint')}</span>
              </label>
              <PasswordInput value={pwForm.next} onChange={v => setPwForm(f => ({ ...f, next: v }))}
                placeholder={t('settings.newPwPh')} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('settings.confirmPw')}</label>
              <PasswordInput value={pwForm.confirm} onChange={v => setPwForm(f => ({ ...f, confirm: v }))}
                placeholder={t('settings.confirmPwPh')} required />
            </div>
            <div className={styles.formActions}>
              <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                {pwLoading ? <span className="spinner" /> : t('settings.savePw')}
              </button>
            </div>
          </form>
        </div>
      </Section>

      {user.role === 'pelanggan' && (
        <Section title={t('settings.lcpSection')}>
          <div className={`card ${styles.formCard}`}>
            <div className="alert alert-warning" style={{ marginBottom: 18 }}>
              {t('settings.passphraseWarn')}
            </div>
            <form onSubmit={handleChangePassphrase} className={styles.form}>
              <div className="form-group">
                <label className="form-label">{t('settings.newPp')}</label>
                <PasswordInput value={ppForm.next} onChange={v => setPpForm(f => ({ ...f, next: v }))}
                  placeholder={t('settings.newPpPh')} required />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.confirmPp')}</label>
                <PasswordInput value={ppForm.confirm} onChange={v => setPpForm(f => ({ ...f, confirm: v }))}
                  placeholder={t('settings.confirmPpPh')} required />
              </div>
              <div className={styles.formActions}>
                <button type="submit" className="btn btn-primary" disabled={ppLoading}>
                  {ppLoading ? <span className="spinner" /> : t('settings.savePp')}
                </button>
              </div>
            </form>
          </div>
        </Section>
      )}
    </div>
  );
}
