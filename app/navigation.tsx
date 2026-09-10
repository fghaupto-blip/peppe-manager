'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export default function Navigation() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [backoffice, setBackoffice] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user ?? null);
      if (data.user) {
        const { data: access } = await supabase.from('backoffice_members').select('active').eq('user_id', data.user.id).maybeSingle();
        setBackoffice(Boolean(access?.active));
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
    window.location.assign('/');
  }

  function handleEdgeTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }

  function handleEdgeTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = Math.abs(touch.clientY - touchStartY.current);
    if (dx > 42 && dy < 55) {
      setOpen(true);
      touchStartX.current = null;
      touchStartY.current = null;
    }
  }

  if (!user) return null;

  const core = [
    { href: '/', label: 'Inicio', icon: '●' },
    { href: '/peppe', label: 'Ahora', icon: '◉' },
    { href: '/history', label: 'Hoy', icon: '▣' },
    { href: '/settings', label: 'Semana', icon: '▭' },
    { href: '/intelligence', label: 'Progreso', icon: '⌁' },
    { href: '/body', label: 'Cuerpo', icon: '♙' },
    { href: '/study', label: 'Nutrición', icon: '◌' },
    { href: '/biochemistry', label: 'Bioquímica', icon: '⌘' },
    { href: '/body-map', label: 'Mapa corporal', icon: '♧' },
    { href: '/integrations', label: 'Integraciones', icon: '⚙' },
  ];

  return <>
    <div className="mobile-edge-zone" aria-hidden="true" onTouchStart={handleEdgeTouchStart} onTouchMove={handleEdgeTouchMove} />

    <button className="mobile-edge-trigger" type="button" aria-label="Abrir navegación" aria-expanded={open} onClick={() => setOpen(true)}>
      <span>›</span>
    </button>

    <button className="menu-trigger" type="button" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span /><span /><span />
    </button>

    {open && <>
      <button className="menu-backdrop" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
      <aside className="side-menu" aria-label="Navegación Peppe">
        <div className="side-menu-head">
          <div><span className="eyebrow">PEPPE</span><strong>Navegación</strong></div>
          <button className="menu-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
        </div>

        <nav className="mobile-core-links" aria-label="Navegación principal móvil">
          {core.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return <Link className={active ? 'active' : ''} href={item.href} key={item.href}>
              <span className="drawer-link-icon">{item.icon}</span>
              <span className="drawer-link-copy"><strong>{item.label}</strong></span>
              <span className="drawer-chevron">›</span>
            </Link>;
          })}
        </nav>

        <div className="side-menu-divider" />
        <nav className="secondary-links" aria-label="Herramientas Peppe">
          <Link href="/backoffice"><span>{backoffice ? 'Intelligence Console' : '🔒 Intelligence Console'}</span><small>{backoffice ? 'Backoffice privado · Command Center, Athlete 360 y auditoría' : 'Backoffice privado · acceso sólo para usuarios autorizados'}</small></Link>
          <Link href="/decision"><span>Decision Engine</span><small>GO, CAUTION, MODIFY o RECOVER con confianza y por qué</small></Link>
          <Link href="/session-response"><span>Session Response</span><small>Respuesta real del cuerpo después del entrenamiento</small></Link>
          <Link href="/moment"><span>Momento pendiente</span><small>Preguntas programadas por Peppe</small></Link>
          <button className="side-menu-signout" type="button" onClick={signOut}>Cerrar sesión</button>
        </nav>
        <div className="side-menu-foot">Peppe pregunta sólo lo que falta.</div>
      </aside>
    </>}

    <nav className="global-nav core-nav" aria-label="Navegación principal">
      {core.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return <Link className={active ? 'active' : ''} href={item.href} key={item.href}><span>{item.icon}</span>{item.label}</Link>;
      })}
    </nav>
  </>;
}
