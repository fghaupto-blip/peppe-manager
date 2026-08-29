'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import styles from './backoffice.module.css';

export default function BackofficeShell({children,title,subtitle}:{children:ReactNode,title:string,subtitle:string}){
  const [state,setState]=useState<'loading'|'ok'|'denied'|'signedout'>('loading');
  const [role,setRole]=useState('');
  const [email,setEmail]=useState('');
  useEffect(()=>{(async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setState('signedout');return;}
    setEmail(user.email||'');
    const {data}=await supabase.from('backoffice_members').select('role,active').eq('user_id',user.id).maybeSingle();
    if(data?.active){setRole(data.role);setState('ok');
      await supabase.from('backoffice_audit_log').insert({actor_id:user.id,athlete_id:user.id,action:'view_backoffice',entity_type:'route',metadata:{path:window.location.pathname}});
    } else setState('denied');
  })()},[]);

  if(state==='loading') return <main className={styles.shell}><section className={`${styles.card} ${styles.gate}`}>Validando acceso privado…</section></main>;
  if(state==='signedout') return <main className={styles.shell}><section className={`${styles.card} ${styles.gate}`}><span className="eyebrow">PEPPE PRIVATE</span><h2>Inicia sesión primero.</h2><p>El backoffice usa la misma identidad segura de Peppe.</p><Link className={styles.button} href="/">Ir a Peppe</Link></section></main>;
  if(state==='denied') return <main className={styles.shell}><section className={`${styles.card} ${styles.gate} ${styles.danger}`}><span className="eyebrow">ACCESO RESTRINGIDO</span><h2>Esta cuenta todavía no está autorizada.</h2><p>Sesión actual: <strong>{email||'cuenta sin email visible'}</strong>.</p><p>La Intelligence Console es privada. Un Owner debe otorgar acceso explícito a esta misma cuenta desde Admin & Access.</p><Link className={`${styles.button} ${styles.secondary}`} href="/">Volver a la app</Link></section></main>;

  return <main className={styles.shell}>
    <header className={styles.top}><div><span className="eyebrow">PEPPE · INTELLIGENCE CONSOLE · {role.toUpperCase()}</span><h1 className={styles.title}>{title}</h1><p className={styles.sub}>{subtitle}</p></div><Link className={`${styles.button} ${styles.secondary}`} href="/">App atleta</Link></header>
    <nav className={styles.nav} aria-label="Backoffice"><Link href="/backoffice">Command Center</Link><Link href="/backoffice/athlete">Athlete 360</Link><Link href="/backoffice/sessions">Session Response</Link><Link href="/backoffice/decisions">Decision Engine</Link><Link href="/backoffice/access">Admin & Access</Link></nav>
    {children}
  </main>;
}
