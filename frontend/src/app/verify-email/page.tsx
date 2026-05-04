'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import styles from '../login/page.module.css';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [isPublisher, setIsPublisher] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token verifikasi tidak ditemukan.');
      return;
    }
    apiClient.post('/auth/verify-email', { token })
      .then(res => {
        setMessage(res.message);
        setIsPublisher(!!res.is_publisher);
        setStatus('success');
      })
      .catch(err => {
        setMessage((err as { error?: string })?.error || 'Verifikasi gagal.');
        setStatus('error');
      });
  }, [token]);

  return (
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>
        <div className={styles.topBar} />
        <div className={styles.body}>
          <div className={styles.header}>
            <h1>Verifikasi Email</h1>
          </div>

          {status === 'loading' && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Memverifikasi...</p>
          )}

          {status === 'success' && (
            <>
              <div className="alert alert-success" style={{ marginBottom: 20, lineHeight: 1.7 }}>
                {message}
              </div>
              {isPublisher ? (
                <>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
                    Langkah berikutnya: login dan upload <strong>Surat Pernyataan Penulis/Penerbit</strong> untuk memulai proses tinjauan admin.
                  </p>
                  <Link href="/login" className="btn btn-primary btn-full">
                    Lanjut ke Halaman Login
                  </Link>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
                    Setelah login, Anda akan diarahkan untuk membuat <strong>LCP Passphrase</strong>.
                  </p>
                  <Link href="/login" className="btn btn-primary btn-full">
                    Lanjut ke Halaman Login
                  </Link>
                </>
              )}
            </>
          )}

          {status === 'error' && (
            <>
              <div className="alert alert-error" style={{ marginBottom: 20 }}>
                {message}
              </div>
              <p className={styles.footer}>
                <Link href="/register">Daftar ulang</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
