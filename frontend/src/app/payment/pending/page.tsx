'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function PaymentPendingPage() {
  const router = useRouter();

  useEffect(() => {
    toast('Pembayaran sedang diproses. Status transaksi akan diperbarui otomatis.', { duration: 5000 });
    router.replace('/dashboard');
  }, [router]);

  return null;
}
