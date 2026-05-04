import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { LangProvider } from '@/context/LangContext';
import { CartProvider } from '@/context/CartContext';
import Navbar from '@/components/Navbar';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'ITSPress — Platform Distribusi E-book Digital',
  description: 'Platform distribusi e-book ITS Press dengan perlindungan Readium LCP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Script
          src={
            process.env.NEXT_PUBLIC_MIDTRANS_ENV === 'production'
              ? 'https://app.midtrans.com/snap/snap.js'
              : 'https://app.sandbox.midtrans.com/snap/snap.js'
          }
          data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
          strategy="afterInteractive"
        />
        <LangProvider>
        <AuthProvider>
        <CartProvider>
          <div className="page-wrapper">
            <Navbar />
            <main className="page-content">
              {children}
            </main>
          </div>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e1e35',
                color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.08)',
              },
            }}
          />
        </CartProvider>
        </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
