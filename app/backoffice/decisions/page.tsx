'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import BackofficeShell from '../BackofficeShell';
import styles from '../backoffice.module.css';

export default function DecisionsAudit(){
  const [items,setItems]=useState<any[]>([]);
  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from('decision_snapshots').select('*').eq('athlete_id',user.id).order('decided_at',{ascending:false}).limit(20);setItems(data||[]);})()},[]);
  return <BackofficeShell title="Decision Engine" subtitle="Audita qué decidió Peppe, con qué señales, qué confianza tuvo y si el resultado posterior confirmó la decisión.">
    <section className={styles.card}><span className="eyebrow">DECISION LEDGER</span><h2>Historial explicable</h2>{items.length?items.map((d:any)=><article className={styles.event} key={d.id}><div className={styles.row}><span>{new Date(d.decided_at||d.created_at).toLocaleString('es-CL')}</span><strong>{d.decision_label}</strong></div><div className={styles.row}><span>Scores</span><strong>R {Math.round(d.readiness_score??0)} · F {Math.round(d.fuel_score??0)} · H {Math.round(d.hydration_score??0)} · Conf {Math.round(d.confidence_pct??0)}%</strong></div><div className={styles.notice}><strong>¿Por qué?</strong><br/>{Array.isArray(d.why)?d.why.join(' · '):'Sin explicación estructurada'}</div></article>):<p>Guarda decisiones desde Decision Engine para construir el ledger.</p>}</section>
    <div className={styles.sectionTitle}><span className="eyebrow">GOVERNANCE</span><h2>Reglas del motor</h2></div><section className={styles.grid3}><article className={styles.card}><h2>Jerarquía</h2><p>Dolor focal o señal de seguridad debe pesar más que un score agregado. Fuel insuficiente modifica estrategia antes de cancelar automáticamente.</p></article><article className={styles.card}><h2>Confidence</h2><p>La confianza sube con datos completos y con historial comparable. Nunca debe fingir precisión cuando faltan observaciones.</p></article><article className={styles.card}><h2>Outcome</h2><p>Cada decisión debe compararse con la Session Response y el estado del día siguiente para saber si fue útil.</p></article></section>
  </BackofficeShell>;
}
