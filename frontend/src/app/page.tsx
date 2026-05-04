'use client';

import Link from 'next/link';
import { useLang } from '@/context/LangContext';
import styles from './page.module.css';

export default function HomePage() {
  const { t } = useLang();
  const [line1, line2] = t('home.heroTitle').split('\n');

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={`container ${styles.heroContent}`}>
          <h1 className={styles.heroTitle}>
            {line1}<br />{line2}
          </h1>
          <p className={styles.heroSub}>{t('home.heroSub')}</p>
          <div className={styles.heroActions}>
            <Link href="/catalog" className="btn btn-outline-white btn-lg">
              {t('home.viewCatalog')} &rarr;
            </Link>
            <Link href="/register" className={styles.heroSecondaryBtn}>
              {t('home.registerNow')} &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className={styles.ctaSection}>
        <div className="container">
          <div className={styles.ctaInner}>
            <div>
              <h2 className={styles.ctaTitle}>{t('home.ctaTitle')}</h2>
              <p className={styles.ctaSub}>{t('home.ctaSub')}</p>
            </div>
            <div className={styles.ctaActions}>
              <Link href="/register?role=pelanggan" className="btn btn-primary">{t('home.ctaCustomer')}</Link>
              <Link href="/register?role=publisher" className="btn btn-outline">{t('home.ctaPublisher')}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
