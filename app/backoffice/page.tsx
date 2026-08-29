'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import BackofficeShell from './BackofficeShell';
import styles from './backoffice.module.css';

export default function BackofficePage(){
  const [data,setData]=useState<any>({});
  const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser(); if(!user){setLoading(false);return;}
    const [metric,score,glucose,decision,session,response,checkin,planned]=await Promise.all([
      supabase.from('daily_metrics').select('*').eq('athlete_id',user.id).order('metric_date',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('scores').select('*').eq('athlete_id',user.id).order('score_date',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('glucose_readings').select('*').eq('athlete_id',user.id).order('measured_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('decision_snapshots').select('*').eq('athlete_id',user.id).order('decided_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('training_sessions').select('*').eq('athlete_id',user.id).order('started_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('session_responses').select('*').eq('athlete_id',user.id).order('responded_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('*').eq('athlete_id',user.id).order('checked_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('planned_sessions').select('*').eq('athlete_id',user.id).gte('scheduled_at',new Date(Date.now()-6*3600e3).toISOString()).order('scheduled_at',{ascending:true}).limit(1).maybeSingle(),
    ]); setData({metric:metric.data,score:score.data,glucose:glucose.data,decision:decision.data,session:session.data,response:response.data,checkin:checkin.data,planned:planned.data});setLoading(false);
  })()},[]);
  const summary=useMemo(()=>({
    readiness:Math.round(data.decision?.readiness_score ?? data.score?.readiness ?? 0),
    fuel:Math.round(data.decision?.fuel_score ?? data.score?.fuel ?? 0),
    recovery:Math.round(data.decision?.recovery_score ?? data.score?.recovery ?? 0),
    confidence:Math.round(data.decision?.confidence_pct ?? 0),
  }),[data]);
  return <BackofficeShell title="Command Center" subtitle="La vista privada para entender estado, riesgo, decisión y respuesta antes de intervenir.">
    {loading?<section className={styles.card}>Cargando inteligencia…</section>:<>
      <section className={styles.hero}>
        <article className={`${styles.card} ${styles.dark}`}><span className="eyebrow light">DECISIÓN ACTUAL</span><h2>{data.decision?.decision_label ?? 'Sin snapshot guardado'}</h2><p>{data.planned?.title?`Próxima sesión: ${data.planned.title}`:'Sin sesión próxima detectada.'}</p><span className={`${styles.status} ${styles.statusDark}`}>Confianza {summary.confidence || '—'}%</span></article>
        <article className={styles.card}><span className="eyebrow">ATENCIÓN</span><h2>{data.metric?.sleep_minutes && data.metric.sleep_minutes<360?'Sueño por debajo de objetivo':'Sin alerta crítica automática'}</h2><p>Las alertas deben explicar qué variable cambió y si modifica realmente la decisión.</p><div className={styles.notice}>{data.glucose?.glucose_mg_dl?`Glucosa reciente: ${Math.round(data.glucose.glucose_mg_dl)} mg/dL`:'Sin glucosa reciente disponible'}</div></article>
      </section>
      <section className={styles.kpis}>{[['Readiness',summary.readiness],['Fuel',summary.fuel],['Recovery',summary.recovery],['Confidence',summary.confidence]].map(([n,v])=><div className={styles.kpi} key={String(n)}><span>{n}</span><strong>{v||'—'}</strong></div>)}</section>
      <section className={styles.grid2}>
        <article className={styles.card}><span className="eyebrow">ATHLETE STATE</span><h2>Señales que importan hoy</h2>{[['Sueño',data.metric?.sleep_minutes?`${Math.floor(data.metric.sleep_minutes/60)}h ${data.metric.sleep_minutes%60}m`:'—'],['HRV',data.metric?.hrv_ms?`${Math.round(data.metric.hrv_ms)} ms`:'—'],['FC reposo',data.metric?.resting_hr_bpm?`${Math.round(data.metric.resting_hr_bpm)} bpm`:'—'],['Energía',data.checkin?.energy?`${data.checkin.energy}/10`:'—'],['Dolor',data.checkin?.pain?'Registrado':'No registrado']].map(([a,b])=><div className={styles.row} key={a}><span>{a}</span><strong>{b}</strong></div>)}</article>
        <article className={styles.card}><span className="eyebrow">ÚLTIMA RESPUESTA</span><h2>{data.response?.response_label ?? 'Pendiente'}</h2>{[['RPE',data.response?.rpe ?? '—'],['FC media',data.response?.avg_hr_bpm?`${Math.round(data.response.avg_hr_bpm)} bpm`:'—'],['TSS',data.response?.tss ?? '—'],['Glucosa pre/post',data.response?.glucose_pre_mg_dl?`${Math.round(data.response.glucose_pre_mg_dl)} → ${Math.round(data.response.glucose_post_mg_dl ?? 0)}`:'—'],['Confianza',data.response?.confidence_pct?`${Math.round(data.response.confidence_pct)}%`:'—']].map(([a,b])=><div className={styles.row} key={a}><span>{a}</span><strong>{b}</strong></div>)}</article>
      </section>
    </>}
  </BackofficeShell>;
}
