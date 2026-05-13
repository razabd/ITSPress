'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PublisherPendingPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/publisher/dashboard'); }, [router]);
  return null;
}
