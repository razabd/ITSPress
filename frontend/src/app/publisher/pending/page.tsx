'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import styles from '../../login/page.module.css';

export default function PublisherPendingPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const { t } = useLang();

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'publisher') { router.replace('/'); return; }
    if (user.approval_status === 'approved' || user.approval_status === '') {
      router.replace('/publisher/dashboard');
      return;
    }
    if (user.approval_status === 'draft') {
      router.replace('/publisher/complete-profile');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  const isRejected = user.approval_status === 'rejected';

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard} style={{ maxWidth: 480 }}>
        <div className={styles.topBar} />
        <div className={styles.body}>

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 64, height: 64,
              borderRadius: '50%',
              background: isRejected ? '#fff0f0' : 'var(--its-navy-pale)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 28,
            }}>
              {isRejected ? '✕' : '⏳'}
            </div>
            <h1 style={{ fontSize: '1.3rem', marginBottom: 6 }}>
              {isRejected ? t('publisherPending.rejectedTitle') : t('publisherPending.pendingTitle')}
            </h1>
          </div>

          {isRejected ? (
            <>
              <div className="alert alert-error" style={{ marginBottom: 16, lineHeight: 1.7 }}>
                {t('publisherPending.rejectedBody')}
              </div>
              {user.approval_note && (
                <div style={{
                  padding: '12px 14px',
                  background: '#fff5f5',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: '0.88rem',
                  lineHeight: 1.6,
                }}>
                  <strong>{t('publisherPending.reasonLabel')}</strong>
                  <br />
                  {user.approval_note}
                </div>
              )}
            </>
          ) : (
            <div className="alert alert-success" style={{ marginBottom: 16, lineHeight: 1.7 }}>
              {t('publisherPending.pendingBody')}
            </div>
          )}

          <p style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.6,
            marginBottom: 20,
          }}>
            {t('publisherPending.contactHint')}
          </p>

          {isRejected && (
            <button
              className="btn btn-primary btn-full"
              onClick={() => router.push('/publisher/complete-profile')}
              style={{ marginBottom: 10 }}
            >
              Upload Ulang Surat Pernyataan
            </button>
          )}

          <button
            className="btn btn-full"
            onClick={logout}
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            {t('publisherPending.logoutBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
