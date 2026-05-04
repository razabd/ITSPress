'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PaymentPendingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.push('/dashboard'), 4000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: '80px' }}>
      <div style={{ fontSize: '4rem', marginBottom: '24px' }}>⏳</div>
      <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--warning)', marginBottom: '12px' }}>
        Pembayaran Sedang Diproses
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>
        Pembayaran Anda sedang menunggu konfirmasi dari bank atau penyedia pembayaran.
      </p>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
        Status akan diperbarui otomatis di dashboard. Anda akan diarahkan dalam 4 detik&hellip;
      </p>
      <button className="btn btn-outline" onClick={() => router.push('/dashboard')}>
        Ke Dashboard
      </button>
    </div>
  );
}
