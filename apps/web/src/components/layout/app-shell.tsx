'use client';

import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { Logo, LogoMark } from '@/components/brand/logo';
import { roleLabel } from '@/lib/labels';
import { MessagesBadge } from './messages-badge';
import { NAV_MENUS, NAVIGATION, type NavItem } from './navigation';
import { NotificationBell } from './notification-bell';

/** The SHC mark. Sizes come from the h-/w- classes; text sizes are ignored. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return <LogoMark className={className.replaceAll(/text-\S+/g, '')} />;
}

const LINK = 'relative flex items-center gap-2 px-3 py-2 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-400';

/** A top-bar link; the current page gets a gold rule underneath. */
function TopLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={`${LINK} ${active ? 'text-white' : 'text-brand-100 hover:text-white'}`}>
      {item.label}
      {item.href === '/messages' && <MessagesBadge />}
      {active && <span aria-hidden className="absolute inset-x-3 -bottom-[13px] h-[3px] bg-accent-500" />}
    </Link>
  );
}

/** A drop-down in the top bar (People, Compliance, Admin). Closes on a click outside, Escape or navigation. */
function Menu_({ label, items, activeHref }: { label: string; items: NavItem[]; activeHref: string | undefined }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const holdsActive = items.some((i) => i.href === activeHref);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const id = `menu-${label.toLowerCase()}`;
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`${LINK} ${holdsActive || open ? 'text-white' : 'text-brand-100 hover:text-white'}`}
      >
        {label}
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        {holdsActive && <span aria-hidden className="absolute inset-x-3 -bottom-[13px] h-[3px] bg-accent-500" />}
      </button>
      <ul id={id} hidden={!open} className="absolute left-0 top-full z-40 mt-3 min-w-56 border border-slate-200 border-t-[3px] border-t-accent-500 bg-white py-1 shadow-[var(--shadow-lift)]">
        {items.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${active ? 'bg-brand-50 font-semibold text-brand-900' : 'text-slate-800 hover:bg-canvas hover:text-brand-900'}`}
              >
                <Icon aria-hidden className="h-4 w-4 text-brand-500" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Signed-in frame (S-018): navy top bar with menus, the page on cream underneath. Guards the route and shows the idle warning. */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, user, can, logout, idleWarning } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const mustSetUp2fa = Boolean(user?.is2faRequired && !user.is2faEnabled);
  const mustChangePassword = Boolean(user?.mustChangePassword);
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
    // A forced password change comes before everything else — the API refuses all other routes (P4-09).
    else if (status === 'authenticated' && mustChangePassword) router.replace('/change-password?required=1');
    // Admins must use 2FA (D-045); the API refuses everything else until it's on.
    else if (status === 'authenticated' && mustSetUp2fa) router.replace('/setup-two-factor');
  }, [status, mustChangePassword, mustSetUp2fa, router]);

  if (status !== 'authenticated' || !user || mustChangePassword || mustSetUp2fa) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-slate-500" aria-live="polite">
        <BrandMark className="h-8 w-8 animate-pulse" />
        Loading…
      </div>
    );
  }

  const items = NAVIGATION.filter((item) => item.permission === null || can(item.permission));
  // The most specific entry wins (e.g. /compliance/audit-log over /compliance).
  const activeHref = items
    .map((item) => item.href)
    .filter((href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const top = items.filter((i) => i.menu === null);
  const menus = NAV_MENUS.map((m) => ({ label: m, items: items.filter((i) => i.menu === m) })).filter((m) => m.items.length);
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  const role = roleLabel(user.roles[0] ?? '');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 print:hidden bg-brand-900 text-white shadow-[0_1px_0_rgb(0_0_0_/_0.2)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-8">
          <Link href="/" className="shrink-0 focus-visible:outline-2 focus-visible:outline-accent-400" aria-label="SHC home">
            <Logo tone="dark" tagline={false} />
          </Link>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 xl:flex">
            {top.map((item) => (
              <TopLink key={item.href} item={item} active={item.href === activeHref} />
            ))}
            {menus.map((m) => (
              <Menu_ key={m.label} label={m.label} items={m.items} activeHref={activeHref} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <div className="hidden items-center gap-3 border-l border-white/15 pl-4 md:flex">
              <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center bg-accent-500 font-display text-sm font-bold text-brand-950">
                {initials}
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block text-xs text-brand-200">{role}</span>
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sign out"
                title="Sign out"
                className="p-2 text-brand-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-accent-400"
              >
                <LogOut aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              className="p-2 text-white hover:bg-white/10 xl:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav aria-label="Main (mobile)" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 bg-brand-950 px-4 pb-4 xl:hidden">
            {[{ label: 'Menu', items: top }, ...menus].map((group) => (
              <div key={group.label} className="pt-4">
                <p className="pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-300">{group.label}</p>
                <ul>
                  {group.items.map((item) => {
                    const active = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-2 border-l-[3px] px-3 py-2.5 text-[15px] ${active ? 'border-accent-500 font-semibold text-white' : 'border-transparent text-brand-100'}`}
                        >
                          {item.label}
                          {item.href === '/messages' && <MessagesBadge />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <button type="button" onClick={() => void logout()} className="mt-4 flex items-center gap-2 px-3 py-2 text-brand-100 md:hidden">
              <LogOut aria-hidden className="h-4 w-4" /> Sign out
            </button>
          </nav>
        )}
      </header>

      {idleWarning && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-8 py-2 text-sm text-amber-900">
          You will be signed out in about a minute because of inactivity. Move the mouse or press a key to stay signed in.
        </div>
      )}

      <main key={pathname} className="mx-auto w-full max-w-7xl flex-1 animate-fade-in px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0">
        {children}
      </main>

      <footer className="print:hidden border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 md:px-8">
          <span>SHC · UK hosted · UK GDPR</span>
          <span>Staff records are confidential. Access is logged.</span>
        </div>
      </footer>
    </div>
  );
}
