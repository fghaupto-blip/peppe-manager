'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import BackofficeShell from '../BackofficeShell';
import styles from '../backoffice.module.css';

export default function Athlete360(){
  const [data,setData]=useState<any>({body:[],labs:[],sweat:[],metrics:[]});
  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const [body,labs,sweat,metrics,interventions]=await Promise.all([
    supabase.from('body_composition_checkpoints').select('*').eq('athlete_id',user.id).order('measured_at',{ascending:false}).limit(8),
    supabase.from('lab_panels').select('*,lab_results(*)').eq('athlete_id',user.id).order('collected_at',{ascending:false}).limit(5),
    supabase.from('sweat_tests').select('*').eq('athlete_id',user.id).order('measured_at',{ascending:false}).limit(6),
    supabase.from('daily_metrics').select('*').eq('athlete_id',user.id).order('metric_date',{ascending:false}).limit(30),
    supabase.from('performance_interventions').select('*').eq('athlete_id',user.id).order('started_at',{ascending:false}).limit(8),
  ]);setData({body:body.data||[],labs:labs.data||[],sweat:sweat.data||[],metrics:metrics.data||[],interventions:interventions.data||[]});})()},[]);
  const latestBody=data.body[0]; const latestMetric=data.metrics[0];
  return <BackofficeShell title="Athlete 360" subtitle="Una ficha longitudinal: lo que cambia cada día y lo que sólo cambia por bloque, test o control clínico.">
    <section className={styles.kpis}><div className={styles.kpi}><span>Peso checkpoint</span><strong>{latestBody?.weight_kg?`${latestBody.weight_kg} kg`:'—'}</strong></div><div className={styles.kpi}><span>Grasa</span><strong>{latestBody?.body_fat_pct?`${latestBody.body_fat_pct}%`:'—'}</strong></div><div className={styles.kpi}><span>HRV reciente</span><strong>{latestMetric?.hrv_ms?`${Math.round(latestMetric.hrv_ms)} ms`:'—'}</strong></div><div className={styles.kpi}><span>FC reposo</span><strong>{latestMetric?.resting_hr_bpm?`${Math.round(latestMetric.resting_hr_bpm)}`:'—'}</strong></div></section>
    <section className={styles.grid2}>
      <article className={styles.card}><span className="eyebrow">COMPOSICIÓN CORPORAL</span><h2>Checkpoints comparables</h2>{data.body.length?data.body.map((x:any)=><div className={styles.event} key={x.id}><strong>{new Date(x.measured_at).toLocaleDateString('es-CL')} · {x.weight_kg ?? '—'} kg</strong><small>{x.body_fat_pct?`${x.body_fat_pct}% grasa · `:''}{x.lean_mass_kg?`${x.lean_mass_kg} kg masa magra · `:''}{x.source||x.device||'manual'}</small></div>):<p>Sin checkpoints todavía.</p>}</article>
      <article className={styles.card}><span className="eyebrow">PERFIL BIOQUÍMICO</span><h2>Paneles y tendencias</h2>{data.labs.length?data.labs.map((x:any)=><div className={styles.event} key={x.id}><strong>{new Date(x.collected_at).toLocaleDateString('es-CL')} · {x.panel_name||'Panel'}</strong><small>{(x.lab_results||[]).length} resultados registrados · {x.provider||'laboratorio no especificado'}</small></div>):<p>Sin paneles de laboratorio cargados.</p>}</article>
      <article className={styles.card}><span className="eyebrow">SWEAT PROFILE</span><h2>Hidratación individual</h2>{data.sweat.length?data.sweat.map((x:any)=><div className={styles.row} key={x.id}><span>{new Date(x.measured_at).toLocaleDateString('es-CL')}</span><strong>{x.sweat_rate_lph?`${Number(x.sweat_rate_lph).toFixed(2)} L/h`:'Test registrado'}</strong></div>):<p>Necesitamos 3–5 tests comparables para una curva personal útil.</p>}</article>
      <article className={styles.card}><span className="eyebrow">INTERVENTIONS → OUTCOMES</span><h2>Aprender de cambios deliberados</h2>{data.interventions.length?data.interventions.map((x:any)=><div className={styles.event} key={x.id}><strong>{x.title}</strong><small>{x.category} · desde {new Date(x.started_at).toLocaleDateString('es-CL')}</small></div>):<p>Aún no hay intervenciones registradas. Aquí vivirán cambios de CHO/h, sodio, sueño, déficit o recuperación.</p>}</article>
    </section>
  </BackofficeShell>;
}
