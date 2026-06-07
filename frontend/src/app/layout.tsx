import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import ClientLayout from '@/components/ClientLayout';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'ITSPress',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
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
        <AuthProvider>
        <CartProvider>
          <ClientLayout>
            {children}
          </ClientLayout>
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
      </body>
    </html>
  );
}
