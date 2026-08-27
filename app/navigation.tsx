'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export default function Navigation() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
    window.location.assign('/');
  }

  if (!user) return null;

  const core = [
    { href: '/', label: 'Hoy', icon: '○' },
    { href: '/peppe', label: 'Peppe', icon: '✦' },
    { href: '/body', label: 'Cuerpo', icon: '◇' },
  ];

  return (
    <>
      <button className="menu-trigger" type="button" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span /><span /><span /></button>
      {open && <><button className="menu-backdrop" aria-label="Cerrar menú" onClick={() => setOpen(false)} /><aside className="side-menu" aria-label="Menú secundario">
        <div className="side-menu-head"><div><span className="eyebrow">PEPPE</span><strong>Más</strong></div><button className="menu-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button></div>
        <nav>
          <Link href="/settings"><span>Plan y rutina</span><small>Objetivo, horarios y configuración del día</small></Link>
          <Link href="/integrations"><span>Fuentes de datos</span><small>Strava y próximas integraciones</small></Link>
          <Link href="/study"><span>Estudio</span><small>Peso, glucosa y registros manuales</small></Link>
          <Link href="/intelligence"><span>Performance Intelligence</span><small>Readiness, fuel, hidratación, clima, labs e historial</small></Link>
          <Link href="/moment"><span>Momento pendiente</span><small>Preguntas programadas por Peppe</small></Link>
          <button className="side-menu-signout" type="button" onClick={signOut}>Cerrar sesión</button>
        </nav>
        <div className="side-menu-foot">Peppe pregunta sólo lo que falta.</div>
      </aside></>}
      <nav className="global-nav core-nav" aria-label="Navegación principal">{core.map((item) => { const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href); return <Link className={active ? 'active' : ''} href={item.href} key={item.href}><span>{item.icon}</span>{item.label}</Link>; })}</nav>
    </>
  );
}
