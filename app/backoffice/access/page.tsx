'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import BackofficeShell from '../BackofficeShell';
import styles from '../backoffice.module.css';

export default function AccessAdmin(){
  const [members,setMembers]=useState<any[]>([]); const [audit,setAudit]=useState<any[]>([]);
  async function load(){const [m,a]=await Promise.all([supabase.from('backoffice_members').select('user_id,role,active,display_name,created_at').order('created_at',{ascending:true}),supabase.from('backoffice_audit_log').select('*').order('created_at',{ascending:false}).limit(20)]);setMembers(m.data||[]);setAudit(a.data||[])}
  useEffect(()=>{load()},[]);
  return <BackofficeShell title="Admin & Access" subtitle="Acceso privado por rol, permisos por atleta y trazabilidad de cada consulta sensible.">
    <section className={styles.grid2}>
      <article className={styles.card}><span className="eyebrow">MEMBERS</span><h2>Usuarios autorizados</h2><div className={styles.access}>{members.map((m:any)=><div className={styles.member} key={m.user_id}><div><strong>{m.display_name||'Usuario autorizado'}</strong><br/><small className={styles.code}>{String(m.user_id).slice(0,8)}…</small></div><div><span className={styles.pill}>{m.role}</span> <span className={styles.pill}>{m.active?'activo':'inactivo'}</span></div></div>)}</div><p>V1: sólo Owner. La arquitectura ya contempla coach, nutritionist, medical, analyst y viewer.</p></article>
      <article className={styles.card}><span className="eyebrow">PERMISSION MODEL</span><h2>Principio de mínimo acceso</h2>{[['Owner','Todo + permisos'],['Coach','Performance + Session Response'],['Nutritionist','Nutrición + CGM + composición'],['Medical','Biomarcadores pertinentes'],['Viewer','Sólo lectura autorizada']].map(([a,b])=><div className={styles.row} key={a}><span>{a}</span><strong>{b}</strong></div>)}</article>
    </section>
    <div className={styles.sectionTitle}><span className="eyebrow">AUDIT LOG</span><h2>Trazabilidad</h2></div><section className={styles.card}>{audit.length?audit.map((x:any)=><div className={styles.row} key={x.id}><span>{new Date(x.created_at).toLocaleString('es-CL')} · {x.action}</span><strong>{x.entity_type||'backoffice'}</strong></div>):<p>El log se irá poblando a medida que se use la consola.</p>}</section>
  </BackofficeShell>;
}
