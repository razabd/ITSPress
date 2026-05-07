import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: '80px', paddingBottom: '80px' }}>
      <p style={{ fontSize: '5rem', fontWeight: 800, color: 'var(--its-navy)', margin: 0, lineHeight: 1 }}>
        404
      </p>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '16px 0 8px', color: 'var(--its-navy)' }}>
        Halaman Tidak Ditemukan
      </h1>
      <p style={{ color: 'var(--text-muted, #666)', marginBottom: '32px', maxWidth: 380, margin: '0 auto 32px' }}>
        Halaman yang Anda cari tidak ada atau telah dipindahkan.
      </p>
      <Link href="/" className="btn btn-primary">
        Kembali ke Beranda
      </Link>
    </div>
  );
}
