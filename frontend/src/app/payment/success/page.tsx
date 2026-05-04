'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function PaymentSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    toast.success('Pembayaran berhasil! Aktifkan lisensi di dashboard.');
    const timer = setTimeout(() => router.push('/dashboard'), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: '80px' }}>
      <div style={{ fontSize: '4rem', marginBottom: '24px' }}>✅</div>
      <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--success)', marginBottom: '12px' }}>
        Pembayaran Berhasil
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
        Transaksi Anda telah dikonfirmasi. Anda akan diarahkan ke dashboard dalam 3 detik&hellip;
      </p>
      <button className="btn btn-primary" onClick={() => router.push('/dashboard')}>
        Ke Dashboard Sekarang
      </button>
    </div>
  );
}
