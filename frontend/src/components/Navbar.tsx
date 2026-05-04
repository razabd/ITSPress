'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { useCart } from '@/context/CartContext';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const { count: cartCount } = useCart();
  const pathname = usePathname();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isHeroPage = pathname === '/';

  const navLinks = [
    { href: '/catalog', label: t('nav.catalog') },
    ...(user?.role === 'admin'
      ? [{ href: '/admin/dashboard', label: 'Admin Panel' }]
      : user?.role === 'publisher'
      ? [{ href: '/publisher/dashboard', label: t('nav.dashboard') }]
      : user
      ? [{ href: '/dashboard', label: t('nav.ebook') }]
      : []),
  ];

  const langOptions = [
    { code: 'IND' as const, flag: '🇮🇩', label: 'Indonesia' },
    { code: 'ENG' as const, flag: '🇬🇧', label: 'English' },
  ];

  const currentFlag = langOptions.find(l => l.code === lang)?.flag ?? '🇮🇩';

  return (
    <nav className={`${styles.nav} ${isHeroPage ? styles.navTransparent : styles.navSolid}`} id="navbar">
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
          {/* Language switcher */}
          <div className={styles.langSwitcher} ref={langRef}>
            <button
              className={styles.langBtn}
              onClick={() => setLangOpen(o => !o)}
              aria-label="Select language"
            >
              <span className={styles.langFlag}>{currentFlag}</span>
              <svg className={`${styles.langChevron} ${langOpen ? styles.langChevronOpen : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {langOpen && (
              <div className={styles.langDropdown}>
                {langOptions.map(l => (
                  <button
                    key={l.code}
                    className={`${styles.langOption} ${lang === l.code ? styles.langOptionActive : ''}`}
                    onClick={() => { setLang(l.code); setLangOpen(false); }}
                  >
                    <span className={styles.langOptionFlag}>{l.flag}</span>
                    <span className={styles.langOptionLabel}>{l.label}</span>
                    {lang === l.code && (
                      <svg className={styles.langCheck} width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

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
              <Link href="/login" className={styles.loginLink}>{t('nav.login')}</Link>
              <Link href="/register" className={`btn btn-primary btn-sm ${styles.registerBtn}`}>
                {t('nav.register')}
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
                  <Link
                    href="/settings"
                    className={styles.userDropdownItem}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {t('nav.settings')}
                  </Link>
                  <div className={styles.userDropdownDivider} />
                  <button
                    className={`${styles.userDropdownItem} ${styles.userDropdownLogout}`}
                    onClick={() => { logout(); setUserMenuOpen(false); }}
                  >
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
