'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Footer.module.css';

const AUTH_PAGES = [
  '/login', '/register', '/forgot-password',
  '/verify-email', '/setup-passphrase', '/reset-password',
];

export default function Footer() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  if (AUTH_PAGES.includes(pathname ?? '')) return null;

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>

        {/* Grid utama */}
        <div className={styles.grid}>

          {/* Kolom 1 — Brand */}
          <div className={styles.brand}>
            <Link href="/" className={styles.brandLogo}>
              <span className={styles.brandIts}>ITS</span>
              <span className={styles.brandPress}>Press</span>
            </Link>
            <p className={styles.brandDesc}>
              Penerbitan resmi Institut Teknologi Sepuluh Nopember yang
              mempublikasikan karya akademik dan literatur berkualitas.
            </p>
            <div className={styles.brandMeta}>
              <span className={styles.brandMetaItem}>Didirikan 1989</span>
              <span className={styles.brandMetaDot} />
              <span className={styles.brandMetaItem}>Surabaya, Indonesia</span>
            </div>
          </div>

          {/* Kolom 2 — Navigasi */}
          <div className={styles.col}>
            <div className={styles.colTitle}>Navigasi</div>
            <Link href="/" className={styles.colLink}>Beranda</Link>
            <Link href="/catalog" className={styles.colLink}>Katalog</Link>
            <Link href="/about" className={styles.colLink}>Tentang Kami</Link>
            <Link href="/login" className={styles.colLink}>Masuk</Link>
          </div>

          {/* Kolom 3 — Informasi */}
          <div className={styles.col}>
            <div className={styles.colTitle}>Informasi</div>
            <div className={styles.colInfo}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>Institut Teknologi Sepuluh Nopember,<br />Sukolilo, Surabaya 60111</span>
            </div>
            <div className={styles.colInfo}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.57 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.74a16 16 0 0 0 6 6l.72-.72a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.28 17z"/>
              </svg>
              <span>08113394792</span>
            </div>
          </div>

        </div>

        {/* Garis bawah + copyright */}
        <div className={styles.bottom}>
          <span className={styles.copyright}>
            © {year} ITS Press · Institut Teknologi Sepuluh Nopember
          </span>
        </div>

      </div>
    </footer>
  );
}
