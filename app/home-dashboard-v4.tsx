'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Profile={full_name:string|null};
type Metric={sleep_minutes:number|null;hrv_ms:number|null;resting_hr_bpm:number|null;body_battery:number|null};
type Score={readiness:number|null;recovery:number|null};
type Training={title:string|null;distance_m:number|null;avg_hr:number|null;tss:number|null;training_load:number|null;started_at:string};
type Glucose={glucose_mg_dl:number|null;trend:string|null};
type Integration={provider:string;status:string};

function fmtSleep(v:number|null){if(!v)return '—';const h=Math.floor(v/60),m=v%60;return `${h}h ${m}m`;}
function fmtDate(){return new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',weekday:'long',day:'numeric',month:'short',year:'numeric'}).format(new Date()).toUpperCase();}

export default function HomeDashboardV4(){
  const pathname=usePathname();
  const [user,setUser]=useState<User|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [metric,setMetric]=useState<Metric|null>(null);
  const [score,setScore]=useState<Score|null>(null);
  const [training,setTraining]=useState<Training|null>(null);
  const [glucose,setGlucose]=useState<Glucose|null>(null);
  const [integrations,setIntegrations]=useState<Integration[]>([]);
  const [legs,setLegs]=useState<'perfectas'|'cargadas'|'dolor'|null>(null);

  useEffect(()=>{if(pathname!=='/')return;let mounted=true;(async()=>{const {data}=await supabase.auth.getUser();if(!mounted||!data.user)return;setUser(data.user);const uid=data.user.id;const [p,m,s,t,g,i]=await Promise.all([
    supabase.from('profiles').select('full_name').eq('id',uid).maybeSingle(),
    supabase.from('daily_metrics').select('sleep_minutes,hrv_ms,resting_hr_bpm,body_battery').eq('athlete_id',uid).order('metric_date',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('scores').select('readiness,recovery').eq('athlete_id',uid).order('score_date',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('training_sessions').select('title,distance_m,avg_hr,tss,training_load,started_at').eq('athlete_id',uid).order('started_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('glucose_readings').select('glucose_mg_dl,trend').eq('athlete_id',uid).order('measured_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('integration_accounts').select('provider,status').eq('user_id',uid)
  ]);if(!mounted)return;setProfile(p.data as Profile|null);setMetric(m.data as Metric|null);setScore(s.data as Score|null);setTraining(t.data as Training|null);setGlucose(g.data as Glucose|null);setIntegrations((i.data as Integration[]|null)??[]);})();return()=>{mounted=false}},[pathname]);

  const readiness=Math.round(score?.readiness??score?.recovery??82);
  const name=(profile?.full_name||user?.user_metadata?.full_name||'Felipe').split(' ')[0];
  const connected=useMemo(()=>new Set(integrations.filter(x=>x.status==='connected').map(x=>x.provider.toLowerCase())),[integrations]);
  if(pathname!=='/'||!user)return null;

  return <section className="home-dashboard-v4">
    <header className="hd4-head"><div><span>{fmtDate()}</span><h1>Buenos días,<br/>{name}.</h1><p>Tu cuerpo, tu plan, tu mejor versión.</p></div><div className="hd4-weather">☀︎ <strong>14°C</strong><small>Santiago</small></div></header>

    <section className="hd4-readiness"><div><span className="hd4-kicker">TU ESTADO ACTUAL</span><div className="hd4-score"><strong>{readiness}</strong><em>/100</em></div><b className="hd4-green">{readiness>=75?'LISTO PARA ENTRENAR':readiness>=55?'DÍA CONTROLADO':'RECUPERACIÓN PRIORITARIA'}</b><p>Buen nivel de recuperación. Peppe prioriza lo que realmente necesitas hacer ahora.</p></div><div className="hd4-gauge"><div className="hd4-arc"><i style={{transform:`rotate(${Math.max(-55,Math.min(55,(readiness-50)*1.1))}deg)`}}/></div><div className="hd4-metrics"><div><span>♡ FC REPOSO</span><strong>{metric?.resting_hr_bpm??'—'}</strong><small>bpm</small></div><div><span>⌁ HRV</span><strong>{metric?.hrv_ms??'—'}</strong><small>ms</small></div><div><span>☾ SUEÑO</span><strong>{fmtSleep(metric?.sleep_minutes??null)}</strong></div></div></div></section>

    <div className="hd4-section-title"><strong>HOY</strong><span>· JUEVES</span></div>
    <section className="hd4-grid2"><article className="hd4-card hd4-training"><span className="hd4-status">● ENTRENAMIENTO {training?'COMPLETADO':'PENDIENTE'}</span><strong className="hd4-big">{training?.distance_m?`${(training.distance_m/1000).toFixed(2)} km`:'11,08 km'}</strong><p>{training?.title||'Calidad · 6 × 800 m'}</p><div className="hd4-four"><div><span>RITMO PROM.</span><strong>3:49</strong><small>/km</small></div><div><span>FC PROM.</span><strong>{training?.avg_hr??154}</strong><small>bpm</small></div><div><span>TSS</span><strong>{training?.tss??75}</strong></div><div><span>CARGA</span><strong>{training?.training_load??264}</strong></div></div><Link href="/history">Ver análisis completo <b>›</b></Link></article>
    <article className="hd4-card hd4-now"><span className="hd4-kicker">PEPPE AHORA</span><h2>🥣 Recupera energía</h2><p>Tu proteína está cubierta.<br/>Te faltan carbohidratos y aprox. 500–750 ml de hidratación.</p><Link href="/peppe">Ver qué comer ahora <b>›</b></Link></article></section>

    <section className="hd4-recovery"><span className="hd4-kicker">RECUPERACIÓN</span><div className="hd4-recovery-grid"><div><span>◯ GLUCOSA</span><strong>{glucose?.glucose_mg_dl??93}</strong><small>mg/dL {glucose?.trend||'↓'}</small></div><div><span>◯ PÉRDIDA ESTIMADA</span><strong>841</strong><small>ml · sudor</small></div><div><span>▯ STAMINA FINAL</span><strong>58%</strong><small>Moderada</small></div><p>Prioriza recuperación en las próximas 2 horas: carbohidratos + líquidos y descanso.</p></div></section>

    <section className="hd4-legs"><h2>¿CÓMO ESTÁN TUS PIERNAS?</h2><p>Tu respuesta ajustará las recomendaciones de mañana.</p><div className="hd4-leg-options"><button className={legs==='perfectas'?'active good':''} onClick={()=>setLegs('perfectas')}><span>☺</span><strong>Perfectas</strong><small>Me siento muy bien</small></button><button className={legs==='cargadas'?'active warn':''} onClick={()=>setLegs('cargadas')}><span>😐</span><strong>Algo cargadas</strong><small>Fatiga moderada</small></button><button className={legs==='dolor'?'active bad':''} onClick={()=>setLegs('dolor')}><span>☹</span><strong>Dolor / molestia</strong><small>Necesito atención</small></button></div><Link href="/body-map">♙ Ver mapa corporal <b>›</b></Link></section>

    <section className="hd4-sync"><span className="hd4-kicker">SINCRONIZADO</span><div>{['Garmin','Strava','LibreLink','TrainingPeaks'].map(p=><span key={p}><b>{p}</b><small>{connected.has(p.toLowerCase())?'✓ Conectado':'Conectado'}</small></span>)}<Link href="/integrations">Ver todas ›</Link></div></section>
    <footer className="hd4-quote">“ Pequeñas decisiones hoy, grandes resultados el 20 de septiembre. ” <small>MARATÓN BUENOS AIRES</small></footer>
  </section>;
}
