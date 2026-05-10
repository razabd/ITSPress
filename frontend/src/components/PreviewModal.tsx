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

  const imgSrc = `${API_BASE_URL}/previews/${bookId}/${currentPage}`;

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
          <span className={styles.title}>Preview: {bookTitle}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.imageWrap}>
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
        </div>

        <div className={styles.nav}>
          <button
            className={styles.navBtn}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ← Prev
          </button>
          <span className={styles.counter}>
            Halaman {currentPage} dari {pageCount} &bull; Preview Gratis
          </span>
          <button
            className={styles.navBtn}
            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
