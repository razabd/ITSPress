'use client';

import Link from 'next/link';
import styles from './page.module.css';

const galleryItems = [
  {
    label: 'Gedung ITS Press',
    grad: 'linear-gradient(145deg, #012D5E 0%, #014A8F 100%)',
    icon: 'building',
  },
  {
    label: 'Studio Percetakan',
    grad: 'linear-gradient(145deg, #0076BB 0%, #014A8F 100%)',
    icon: 'print',
  },
  {
    label: 'Koleksi Terbitan',
    grad: 'linear-gradient(145deg, #013870 0%, #004080 100%)',
    icon: 'books',
  },
  {
    label: 'Tim Editorial',
    grad: 'linear-gradient(145deg, #005F8B 0%, #0076BB 100%)',
    icon: 'team',
  },
  {
    label: 'Distribusi Digital',
    grad: 'linear-gradient(145deg, #014A8F 0%, #006FA3 100%)',
    icon: 'digital',
  },
];

function GalleryIcon({ type }: { type: string }) {
  const props = {
    width: 36, height: 36, fill: 'none',
    stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1.5,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  if (type === 'building') return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="1"/>
      <path d="M9 22V12h6v10M3 9h18M3 15h18"/>
    </svg>
  );
  if (type === 'print') return (
    <svg viewBox="0 0 24 24" {...props}>
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
  if (type === 'books') return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
  if (type === 'team') return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  );
}

export default function AboutPage() {
  return (
    <div className={styles.page}>

      {/* ── ABOUT ── */}
      <section className={styles.aboutSection}>
        <div className={styles.aboutGrid}>

          {/* Kiri — teks */}
          <div className={styles.aboutLeft}>
            <div className={styles.aboutLeftInner}>
              <h2 className={styles.sectionTitle}>Tentang Kami</h2>
              <p className={styles.aboutLead}>
                ITS Press adalah penerbitan resmi Institut Teknologi Sepuluh Nopember
                yang mempublikasikan karya-karya akademik dan literatur berkualitas.
              </p>
              <p className={styles.aboutBody}>
                ITS Press dibentuk dan ditetapkan pada tanggal{' '}
                15 Juli 1989 melalui SK Rektor Institut Teknologi
                Sepuluh Nopember No.2761/PT12.H/N/1989 tentang Pembentukan UPT
                Percetakan ITS.
              </p>
              <p className={styles.aboutBody}>
                Awalnya unit ini dibentuk karena kebutuhan internal institut akan
                adanya suatu sarana pengelola yang melayani bidang produksi percetakan
                dan penerbitan dilingkungan ITS yang pada aktifitasnya erat
                berhubungan dengan pembuatan dan penerbitan jurnal ilmiah, berita ITS,
                buku ajar, percetakan umum, laporan akademis, penyediaan media cetak
                untuk pendidikan serta penelitian.
              </p>
            </div>
          </div>

          {/* Kanan — panel biru, langsung tanpa wrapper card */}
          <div className={styles.aboutRight}>
            <div className={styles.skItem}>
              <div className={styles.skItemNum}>1989</div>
              <div className={styles.skItemLabel}>Tahun Berdiri</div>
            </div>
            <div className={styles.skDivider} />
            <div className={styles.skItem}>
              <div className={styles.skItemMeta}>Dasar Hukum</div>
              <div className={styles.skItemVal}>SK Rektor ITS</div>
            </div>
            <div className={styles.skDivider} />
            <div className={styles.skItem}>
              <div className={styles.skItemMeta}>Nomor SK</div>
              <div className={styles.skItemMono}>No.2761/PT12.H/N/1989</div>
            </div>
            <div className={styles.skDivider} />
            <div className={styles.skItem}>
              <div className={styles.skItemMeta}>Tentang</div>
              <div className={styles.skItemText}>
                Pembentukan UPT Percetakan ITS yang kemudian berkembang menjadi
                lembaga penerbitan resmi ITS Press
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── GALLERY ── */}
      <section className={styles.gallerySection}>
        <div className={styles.galleryInner}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Galeri ITS Press</h2>
            <p className={styles.sectionSub}>Dokumentasi kegiatan dan fasilitas ITS Press</p>
          </div>
          <div className={styles.galleryGrid}>
            {galleryItems.map((item, i) => (
              <div
                key={i}
                className={styles.galleryItem}
                style={{ background: item.grad }}
              >
                <div className={styles.galleryStripe} />
                <div className={styles.galleryGlow} />
                <div className={styles.galleryIconWrap}>
                  <GalleryIcon type={item.icon} />
                </div>
                <div className={styles.galleryFooter}>
                  <span className={styles.galleryNum}>0{i + 1}</span>
                  <span className={styles.galleryLabel}>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LOCATION ── */}
      <section className={styles.locationSection}>
        <div className={styles.locationGrid}>

          {/* Kiri — navy, info */}
          <div className={styles.locationLeft}>
            <h2 className={styles.locationTitle}>Lokasi</h2>
            <div className={styles.locationAddrBlock}>
              <svg className={styles.locationIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div className={styles.locationText}>
                <div className={styles.locationName}>ITS Press</div>
                <div className={styles.locationAddr}>
                  Institut Teknologi Sepuluh Nopember<br />
                  Sukolilo, Surabaya, Jawa Timur
                </div>
              </div>
            </div>
            <Link
              href="https://maps.app.goo.gl/iS2t6ik1ZoEVJ6Zs6"
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-outline-white ${styles.mapsBtn}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Buka di Google Maps
            </Link>
          </div>

          {/* Kanan — peta, full height */}
          <div className={styles.locationRight}>
            <iframe
              className={styles.locationMapIframe}
              src="https://maps.google.com/maps?q=ITS+Press+Institut+Teknologi+Sepuluh+Nopember+Sukolilo+Surabaya&output=embed"
              title="Lokasi ITS Press"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>

        </div>
      </section>

    </div>
  );
}
