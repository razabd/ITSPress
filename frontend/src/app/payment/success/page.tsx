'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function PaymentSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    toast.success('Pembayaran berhasil! Silakan buka buku Anda dari dashboard.');
    router.replace('/dashboard');
  }, [router]);

  return null;
}
