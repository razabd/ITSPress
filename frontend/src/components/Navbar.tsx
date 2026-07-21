'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import ConfirmModal from './ConfirmModal';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count: cartCount } = useCart();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  // Keputusan: drawer slide-in dari kanan untuk mobile — pola yang paling
  // dikenali pengguna, dan semua target sentuh di dalamnya minimal 48px
  const [drawerOpen, setDrawerOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Tutup drawer setiap navigasi berpindah halaman
  useEffect(() => {
    setDrawerOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Keputusan a11y: Escape menutup drawer/dropdown, dan body di-lock
  // agar konten belakang tidak ikut scroll saat drawer terbuka
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const navLinks = [
    { href: '/catalog', label: 'Katalog' },
    ...(user?.role === 'admin'
      ? [{ href: '/admin/dashboard', label: 'Admin Panel' }]
      : user?.role === 'publisher'
      ? [{ href: '/publisher/dashboard', label: 'Dashboard' }]
      : user
      ? [{ href: '/dashboard', label: 'E-book' }]
      : []),
    { href: '/about', label: 'Tentang' },
  ];

  return (
    <>
    <ConfirmModal
      open={logoutModalOpen}
      title="Keluar dari Akun?"
      message="Anda akan mengakhiri sesi ini. Pastikan sudah menyimpan semua perubahan sebelum keluar."
      confirmLabel="Ya, Keluar"
      onConfirm={() => { logout(); setLogoutModalOpen(false); }}
      onCancel={() => setLogoutModalOpen(false)}
    />
    <nav className={styles.nav} id="navbar">
      <div className={`container ${styles.inner}`}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIts}>ITS</span>
          <span className={styles.logoPress}>Press</span>
        </Link>

        {/* Nav links — hanya desktop (>=768px), disembunyikan via CSS */}
        <div className={styles.links}>
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${pathname === link.href ? styles.linkActive : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth Area kanan */}
        <div className={styles.authArea}>
          {/* Keputusan: cart tetap terlihat di navbar mobile (di luar drawer)
              karena aksinya sering dipakai dan butuh akses satu ketukan */}
          {user?.role === 'pelanggan' && (
            <Link href="/cart" className={styles.cartBtn} aria-label="Keranjang belanja">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              {cartCount > 0 && (
                <span className={styles.cartBadge}>{cartCount}</span>
              )}
            </Link>
          )}

          {!user ? (
            <div className={styles.guestActions}>
              <Link href="/login" className={styles.loginLink}>Masuk</Link>
              <Link href="/register" className={`btn btn-primary btn-sm ${styles.registerBtn}`}>
                Daftar
              </Link>
            </div>
          ) : (
            <div className={styles.userMenu} ref={userMenuRef}>
              <button
                className={styles.userTrigger}
                onClick={() => setUserMenuOpen(o => !o)}
                aria-label="Account menu"
                aria-expanded={userMenuOpen}
              >
                <div className={styles.avatar}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className={styles.userName}>{user.name.split(' ')[0]}</span>
                <svg className={`${styles.langChevron} ${userMenuOpen ? styles.langChevronOpen : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {userMenuOpen && (
                <div className={styles.userDropdown}>
                  <div className={styles.userDropdownBody}>
                    <Link
                      href="/settings"
                      className={styles.userDropdownItem}
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <svg className={styles.userDropdownItemIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                      Pengaturan
                    </Link>
                    <div className={styles.userDropdownDivider} />
                    <button
                      className={`${styles.userDropdownItem} ${styles.userDropdownLogout}`}
                      onClick={() => { setUserMenuOpen(false); setLogoutModalOpen(true); }}
                    >
                      <svg className={styles.userDropdownItemIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Keluar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hamburger — hanya tampil <768px */}
          <button
            className={styles.hamburger}
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu navigasi"
            aria-expanded={drawerOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ===== Drawer mobile ===== */}
      {/* Overlay gelap: klik di mana pun menutup drawer */}
      <div
        className={`${styles.drawerOverlay} ${drawerOpen ? styles.drawerOverlayOpen : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ''}`}
        aria-label="Menu navigasi"
        aria-hidden={!drawerOpen}
      >
        <div className={styles.drawerHead}>
          {user ? (
            <div className={styles.drawerUser}>
              <div className={styles.avatar}>{user.name.charAt(0).toUpperCase()}</div>
              <div className={styles.drawerUserInfo}>
                <span className={styles.drawerUserName}>{user.name}</span>
                <span className={styles.drawerUserRole}>{user.role}</span>
              </div>
            </div>
          ) : (
            <span className={styles.drawerTitle}>Menu</span>
          )}
          <button
            className={styles.drawerClose}
            onClick={() => setDrawerOpen(false)}
            aria-label="Tutup menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.drawerLinks}>
          <Link href="/" className={`${styles.drawerLink} ${pathname === '/' ? styles.drawerLinkActive : ''}`}>
            Beranda
          </Link>
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.drawerLink} ${pathname === link.href ? styles.drawerLinkActive : ''}`}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <Link href="/settings" className={`${styles.drawerLink} ${pathname === '/settings' ? styles.drawerLinkActive : ''}`}>
              Pengaturan
            </Link>
          )}
        </div>

        <div className={styles.drawerFoot}>
          {!user ? (
            <>
              <Link href="/login" className="btn btn-outline btn-full">Masuk</Link>
              <Link href="/register" className="btn btn-primary btn-full">Daftar</Link>
            </>
          ) : (
            <button
              className={`btn btn-ghost btn-full ${styles.drawerLogout}`}
              onClick={() => { setDrawerOpen(false); setLogoutModalOpen(true); }}
            >
              Keluar
            </button>
          )}
        </div>
      </aside>
    </nav>
    </>
  );
}
