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

        {/* Nav Links center */}
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

        {/* Auth Area right */}
        <div className={styles.authArea}>
          {/* Cart icon — hanya untuk pelanggan yang sudah login */}
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
            <>
              <Link href="/login" className={styles.loginLink}>Masuk</Link>
              <Link href="/register" className={`btn btn-primary btn-sm ${styles.registerBtn}`}>
                Daftar
              </Link>
            </>
          ) : (
            <div className={styles.userMenu} ref={userMenuRef}>
              <button
                className={styles.userTrigger}
                onClick={() => setUserMenuOpen(o => !o)}
                aria-label="Account menu"
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
        </div>
      </div>
    </nav>
    </>
  );
}
