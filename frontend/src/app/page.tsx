'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { Book } from '@/types';
import styles from './page.module.css';

export default function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    apiClient.get('/books')
      .then(data => setBooks((data.data || []).slice(0, 12)))
      .catch(() => {});
  }, []);

  const coverSrc = (book: Book) =>
    book.cover_url
      ? (book.cover_url.startsWith('http')
          ? book.cover_url
          : `${API_BASE_URL.replace(/\/api\/v1$/, '')}${book.cover_url}`)
      : null;

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Akses E-book Akademik ITS Press Kapan Saja
            </h1>
            <p className={styles.heroSub}>
              Temukan dan unduh koleksi buku digital terbitan ITS Press dari teknik, sains, hingga manajemen.
            </p>
            <div className={styles.heroActions}>
              <Link href="/catalog" className="btn btn-primary btn-lg">
                Jelajahi Katalog
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURED BOOKS ===== */}
      {books.length > 0 && (
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Koleksi Buku</h2>
              <Link href="/catalog" className={styles.sectionLink}>
                Lihat semua &rarr;
              </Link>
            </div>
            <div className={styles.shelf}>
              {books.map(book => {
                const src = coverSrc(book);
                return (
                  <Link key={book.ID} href={`/catalog/${book.ID}`} className={styles.bookCard}>
                    <div className={styles.bookCoverWrap}>
                      {src ? (
                        <img src={src} alt={book.title} className={styles.bookCoverImg} />
                      ) : (
                        <div className={styles.bookCoverPlaceholder}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <h3 className={styles.bookTitle}>{book.title}</h3>
                    <span className={book.price === 0 ? `${styles.bookPrice} ${styles.bookPriceFree}` : styles.bookPrice}>
                      {book.price === 0 ? 'Gratis' : `Rp ${book.price.toLocaleString('id-ID')}`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
