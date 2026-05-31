import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <div>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroGlowTop} />
        <div className={styles.heroGlowBottom} />
        <div className={`container ${styles.heroContent}`}>
          <h1 className={styles.heroTitle}>
            ITSPress — Akses Koleksi Buku Digital ITS Press
          </h1>
          <p className={styles.heroSub}>Temukan dan unduh e-book akademik terbitan ITS Press.</p>
          <div className={styles.heroActions}>
            <Link href="/catalog" className="btn btn-outline-white btn-lg">
              Lihat Katalog
            </Link>
            <Link href="/register" className={styles.heroSecondaryBtn}>
              Daftar Sekarang &rarr;
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
