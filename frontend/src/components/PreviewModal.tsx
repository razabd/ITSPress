'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import styles from './PreviewModal.module.css';

interface Props {
  bookId: number;
  pageCount: number;
  bookTitle: string;
  onClose: () => void;
}

export default function PreviewModal({ bookId, pageCount, bookTitle, onClose }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [imgLoading, setImgLoading] = useState(true);
  // Keputusan: dukung swipe kiri/kanan di layar sentuh — sebelumnya tombol
  // navigasi disembunyikan di mobile tanpa alternatif, sehingga pengguna
  // tidak bisa berpindah halaman sama sekali
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const imgSrc = `${API_BASE_URL}/previews/${bookId}/${currentPage}`;
  const progress = (currentPage / pageCount) * 100;

  const goPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const goNext = () => setCurrentPage(p => Math.min(pageCount, p + 1));

  const handleTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    // Ambang 48px agar tap biasa tidak dianggap swipe
    if (delta > 48) goPrev();
    else if (delta < -48) goNext();
    setTouchStartX(null);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrentPage(p => Math.max(1, p - 1));
      if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(pageCount, p + 1));
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, pageCount]);

  useEffect(() => {
    setImgLoading(true);
  }, [currentPage]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <span className={styles.title}>{bookTitle}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Tutup">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className={styles.imageWrap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            className={`${styles.sideBtn} ${styles.sideBtnLeft}`}
            onClick={goPrev}
            disabled={currentPage === 1}
            aria-label="Halaman sebelumnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          {imgLoading && <div className={styles.imgPlaceholder} />}
          <img
            key={imgSrc}
            src={imgSrc}
            alt={`Halaman ${currentPage}`}
            className={styles.pageImg}
            style={{ opacity: imgLoading ? 0 : 1 }}
            onLoad={() => setImgLoading(false)}
            onError={() => setImgLoading(false)}
          />

          <button
            className={`${styles.sideBtn} ${styles.sideBtnRight}`}
            onClick={goNext}
            disabled={currentPage === pageCount}
            aria-label="Halaman berikutnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className={styles.footer}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.footerContent}>
            {/* Tombol prev/next di footer — hanya tampil di mobile (CSS),
                melengkapi gesture swipe sebagai afordansi yang terlihat */}
            <button
              className={styles.footNavBtn}
              onClick={goPrev}
              disabled={currentPage === 1}
              aria-label="Halaman sebelumnya"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className={styles.pageInfo}>
              <span className={styles.pageNum}>{currentPage}</span>
              <span className={styles.pageSep}> / </span>
              <span className={styles.pageTotal}>{pageCount}</span>
            </span>
            <span className={styles.hint}>Preview Gratis · ← → untuk navigasi</span>
            <button
              className={styles.footNavBtn}
              onClick={goNext}
              disabled={currentPage === pageCount}
              aria-label="Halaman berikutnya"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
