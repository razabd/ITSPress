'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isReader = pathname?.startsWith('/read/');

  if (isReader) {
    return <>{children}</>;
  }

  return (
    <div className="page-wrapper">
      <Navbar />
      <main className="page-content">
        {children}
      </main>
      <Footer />
    </div>
  );
}
