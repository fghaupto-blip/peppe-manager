'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import BackofficeShell from '../BackofficeShell';
import styles from '../backoffice.module.css';

export default function SessionsLab(){
  const [sessions,setSessions]=useState<any[]>([]); const [responses,setResponses]=useState<any[]>([]); const [weather,setWeather]=useState<any[]>([]);
  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const [s,r,w]=await Promise.all([
    supabase.from('training_sessions').select('*').eq('athlete_id',user.id).order('started_at',{ascending:false}).limit(12),
    supabase.from('session_responses').select('*').eq('athlete_id',user.id).order('responded_at',{ascending:false}).limit(12),
    supabase.from('environment_session_context').select('*').eq('athlete_id',user.id).order('observed_at',{ascending:false}).limit(12),
  ]);setSessions(s.data||[]);setResponses(r.data||[]);setWeather(w.data||[]);})()},[]);
  const responseBySession=new Map(responses.map(x=>[x.training_session_id,x])); const weatherBySession=new Map(weather.map(x=>[x.training_session_id,x]));
  return <BackofficeShell title="Session Response" subtitle="Reconstruye cada sesión desde el plan hasta la respuesta fisiológica, metabólica, mecánica y subjetiva.">
    <section className={`${styles.card}`}><span className="eyebrow">SESSION TIMELINE</span><h2>Últimos entrenamientos</h2><div style={{overflowX:'auto'}}><table className={styles.table}><thead><tr><th>Fecha</th><th>Sesión</th><th>Duración</th><th>FC</th><th>RPE</th><th>Glucosa</th><th>Clima</th><th>Respuesta</th></tr></thead><tbody>{sessions.map((s:any)=>{const r=responseBySession.get(s.id);const w=weatherBySession.get(s.id);return <tr key={s.id}><td>{s.started_at?new Date(s.started_at).toLocaleDateString('es-CL'):'—'}</td><td><strong>{s.title||s.activity_type||'Entrenamiento'}</strong><br/><small>{s.distance_km?`${Number(s.distance_km).toFixed(1)} km`:''}</small></td><td>{s.duration_seconds?`${Math.round(s.duration_seconds/60)} min`:'—'}</td><td>{r?.avg_hr_bpm?`${Math.round(r.avg_hr_bpm)} bpm`:s.avg_hr_bpm?`${Math.round(s.avg_hr_bpm)} bpm`:'—'}</td><td>{r?.rpe??'—'}</td><td>{r?.glucose_pre_mg_dl?`${Math.round(r.glucose_pre_mg_dl)} → ${r.glucose_post_mg_dl?Math.round(r.glucose_post_mg_dl):'—'}`:'—'}</td><td>{w?.temperature_c?`${w.temperature_c}° · ${w.humidity_pct??'—'}%`:'—'}</td><td><span className={styles.pill}>{r?.response_label||'Pendiente'}</span></td></tr>})}</tbody></table></div></section>
    <div className={styles.sectionTitle}><span className="eyebrow">LEARNING LAYER</span><h2>Lo que Peppe debe aprender</h2></div>
    <section className={styles.grid3}><article className={styles.card}><h2>Cardiac Response</h2><p>Comparar FC y deriva para ritmos/potencias equivalentes, controlando temperatura, sueño y carga previa.</p></article><article className={styles.card}><h2>Fuel + Glycemic</h2><p>Relacionar CHO pre/durante/post con estabilidad CGM, hambre, RPE y recuperación siguiente.</p></article><article className={styles.card}><h2>Mechanical</h2><p>Cadencia, GCT, zancada y potencia para detectar economía estable versus deterioro bajo fatiga.</p></article></section>
  </BackofficeShell>;
}
