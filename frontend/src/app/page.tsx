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
        <div className={styles.heroGlowTop} />
        <div className={styles.heroGlowBottom} />
        <div className={`container ${styles.heroContent}`}>
          <h1 className={styles.heroTitle}>
            {line1}{line2 && <><br />{line2}</>}
          </h1>
          <p className={styles.heroSub}>{t('home.heroSub')}</p>
          <div className={styles.heroActions}>
            <Link href="/catalog" className="btn btn-outline-white btn-lg">
              {t('home.viewCatalog')}
            </Link>
            <Link href="/register" className={styles.heroSecondaryBtn}>
              {t('home.registerNow')} &rarr;
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
