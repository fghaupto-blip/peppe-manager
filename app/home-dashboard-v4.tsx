'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Profile={full_name:string|null};
type Metric={sleep_minutes:number|null;hrv_ms:number|null;resting_hr_bpm:number|null;body_battery:number|null;metric_date:string;source:string|null;updated_at:string|null};
type Score={readiness:number|null;recovery:number|null;load:number|null;score_date:string};
type Training={provider:string;title:string|null;distance_m:number|null;duration_seconds:number|null;avg_hr:number|null;tss:number|null;training_load:number|null;intensity_factor:number|null;started_at:string};
type Glucose={glucose_mg_dl:number|null;trend:string|null};
type Integration={provider:string;status:string;last_synced_at:string|null};

function fmtSleep(v:number|null){if(!v)return '—';const h=Math.floor(v/60),m=v%60;return `${h}h ${String(m).padStart(2,'0')}m`;}
function fmtDate(){return new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()).toUpperCase();}
function fmtWeekday(){return new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',weekday:'long'}).format(new Date()).toUpperCase();}
function fmtShortDate(v:string|null|undefined){if(!v)return '';return new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'short'}).format(new Date(`${v}T12:00:00-03:00`));}
function fmtPace(training:Training|null){if(!training?.distance_m||!training?.duration_seconds)return '—';const secPerKm=training.duration_seconds/(training.distance_m/1000);const min=Math.floor(secPerKm/60);const sec=Math.round(secPerKm%60);return `${min}:${String(sec).padStart(2,'0')}`;}
function providerLabel(p:string|null|undefined){if(!p)return 'Peppe';const x=p.toLowerCase();if(x==='garmin')return 'Garmin';if(x==='trainingpeaks')return 'TrainingPeaks';if(x==='strava')return 'Strava';return p;}

function mergeLatestSessions(rows:Training[]):Training|null{
  if(!rows.length)return null;
  const latestTs=Math.max(...rows.map(r=>new Date(r.started_at).getTime()));
  const same=rows.filter(r=>Math.abs(new Date(r.started_at).getTime()-latestTs)<3*60*1000);
  const priority=(p:string)=>p.toLowerCase()==='garmin'?3:p.toLowerCase()==='trainingpeaks'?2:1;
  const base=[...same].sort((a,b)=>priority(b.provider)-priority(a.provider))[0]??rows[0];
  const pick=<K extends keyof Training>(key:K):Training[K]=>{
    const ordered=[...same].sort((a,b)=>priority(b.provider)-priority(a.provider));
    for(const r of ordered){const v=r[key];if(v!==null&&v!==undefined&&v!=='')return v;}
    return base[key];
  };
  return {...base,title:pick('title'),distance_m:pick('distance_m'),duration_seconds:pick('duration_seconds'),avg_hr:pick('avg_hr'),tss:pick('tss'),training_load:pick('training_load'),intensity_factor:pick('intensity_factor')};
}

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
  const [lastRefresh,setLastRefresh]=useState<Date|null>(null);

  async function load(uid:string){
    const [p,m,s,t,g,i]=await Promise.all([
      supabase.from('profiles').select('full_name').eq('id',uid).maybeSingle(),
      supabase.from('daily_metrics').select('sleep_minutes,hrv_ms,resting_hr_bpm,body_battery,metric_date,source,updated_at').eq('athlete_id',uid).order('metric_date',{ascending:false}).order('updated_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('scores').select('readiness,recovery,load,score_date').eq('athlete_id',uid).order('score_date',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('training_sessions').select('provider,title,distance_m,duration_seconds,avg_hr,tss,training_load,intensity_factor,started_at').eq('athlete_id',uid).order('started_at',{ascending:false}).limit(8),
      supabase.from('glucose_readings').select('glucose_mg_dl,trend').eq('athlete_id',uid).order('measured_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('integration_accounts').select('provider,status,last_synced_at').eq('user_id',uid)
    ]);
    setProfile(p.data as Profile|null);
    setMetric(m.data as Metric|null);
    setScore(s.data as Score|null);
    setTraining(mergeLatestSessions((t.data as Training[]|null)??[]));
    setGlucose(g.data as Glucose|null);
    setIntegrations((i.data as Integration[]|null)??[]);
    setLastRefresh(new Date());
    return (i.data as Integration[]|null)??[];
  }

  async function refreshAll(uid:string){
    const list=await load(uid);
    const strava=list.find(x=>x.provider.toLowerCase()==='strava'&&x.status==='connected');
    const stale=!strava?.last_synced_at||Date.now()-new Date(strava.last_synced_at).getTime()>10*60*1000;
    if(stale){
      await supabase.functions.invoke('strava-sync',{body:{days:30}}).catch(()=>null);
      await load(uid);
    }
  }

  useEffect(()=>{
    if(pathname!=='/')return;
    let active=true;
    let timer:ReturnType<typeof setInterval>|null=null;
    let uid='';
    const onVisible=()=>{if(document.visibilityState==='visible'&&uid)refreshAll(uid);};
    (async()=>{
      const {data}=await supabase.auth.getUser();
      if(!active||!data.user)return;
      uid=data.user.id;setUser(data.user);
      await refreshAll(uid);
      timer=setInterval(()=>{if(document.visibilityState==='visible')refreshAll(uid);},5*60*1000);
      document.addEventListener('visibilitychange',onVisible);
    })();
    return()=>{active=false;if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
  },[pathname]);

  const readinessRaw=score?.readiness??score?.recovery??null;
  const readiness=readinessRaw==null?null:Math.round(readinessRaw);
  const name=(profile?.full_name||user?.user_metadata?.full_name||'Felipe').split(' ')[0];
  const connected=useMemo(()=>new Set(integrations.filter(x=>x.status==='connected').map(x=>x.provider.toLowerCase())),[integrations]);
  const garmin=integrations.find(x=>x.provider.toLowerCase()==='garmin');
  const strava=integrations.find(x=>x.provider.toLowerCase()==='strava');
  const tp=integrations.find(x=>x.provider.toLowerCase()==='trainingpeaks');
  const trainingSource=providerLabel(training?.provider);
  if(pathname!=='/'||!user)return null;

  return <section className="home-dashboard-v4">
    <header className="hd4-head"><div><span>{fmtDate()}</span><h1>Buenos días,<br/>{name}.</h1><p>Tu cuerpo, tu plan, tu mejor versión.</p></div><div className="hd4-weather"><strong>PEPPE</strong><small>{lastRefresh?`Actualizado ${lastRefresh.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}`:'Actualizando…'}</small></div></header>

    <section className="hd4-readiness"><div><span className="hd4-kicker">TU ESTADO ACTUAL</span><div className="hd4-score"><strong>{readiness??'—'}</strong><em>/100</em></div><b className="hd4-green">{readiness==null?'DATOS PENDIENTES':readiness>=75?'LISTO PARA ENTRENAR':readiness>=55?'DÍA CONTROLADO':'RECUPERACIÓN PRIORITARIA'}</b><p>{readiness==null?'Peppe está esperando métricas recientes para calcular tu estado.':'Peppe prioriza lo que realmente necesitas hacer ahora.'}</p>{score?.score_date&&<small className="hd4-source-line">Score Peppe · {fmtShortDate(score.score_date)}</small>}</div><div className="hd4-gauge"><div className="hd4-arc"><i style={{transform:`rotate(${readiness==null?-55:Math.max(-55,Math.min(55,(readiness-50)*1.1))}deg)`}}/></div><div className="hd4-metrics"><div className="metric-rest"><span>♡ FC REPOSO</span><strong>{metric?.resting_hr_bpm??'—'}</strong><small>{metric?.resting_hr_bpm!=null?'bpm · Garmin':'Esperando Garmin'}</small></div><div className="metric-hrv"><span>⌁ HRV</span><strong>{metric?.hrv_ms??'—'}</strong><small>{metric?.hrv_ms!=null?'ms · Garmin':'Esperando Garmin'}</small></div><div className="metric-sleep"><span>☾ SUEÑO</span><strong>{fmtSleep(metric?.sleep_minutes??null)}</strong><small>{metric?.sleep_minutes?'Garmin · sueño nocturno':'Esperando Garmin'}</small></div></div>{metric?.metric_date&&<div className="hd4-data-fresh"><span className="source-dot garmin"></span>Garmin · datos del {fmtShortDate(metric.metric_date)}</div>}</div></section>

    <div className="hd4-section-title"><strong>HOY</strong><span>· {fmtWeekday()}</span></div>
    <section className="hd4-grid2"><article className="hd4-card hd4-training"><div className="hd4-training-top"><span className="hd4-status">● ENTRENAMIENTO {training?'REGISTRADO':'PENDIENTE'}</span>{training&&<span className={`hd4-source-badge source-${trainingSource.toLowerCase()}`}>{trainingSource}</span>}</div><strong className="hd4-big">{training?.distance_m?`${(training.distance_m/1000).toFixed(2)} km`:'—'}</strong><p>{training?.title||'Sin actividad reciente importada'}</p><div className="hd4-four"><div className="stat-pace"><span>RITMO PROM.</span><strong>{fmtPace(training)}</strong><small>/km</small></div><div className="stat-hr"><span>FC PROM.</span><strong>{training?.avg_hr??'—'}</strong><small>bpm</small></div><div className="stat-tss"><span>TSS</span><strong>{training?.tss??'—'}</strong><small>{training?.tss!=null?trainingSource:tp?.status==='connected'?'TrainingPeaks':'Conectar TP'}</small></div><div className="stat-load"><span>CARGA</span><strong>{training?.training_load??'—'}</strong><small>{training?.training_load!=null?trainingSource:tp?.status==='connected'?'TrainingPeaks':'Conectar TP'}</small></div></div><div className="hd4-intensity-key"><span className="z2">Aeróbico</span><span className="z3">Tempo</span><span className="z4">Umbral</span><span className="z5">Máximo</span></div><Link href="/history">Ver análisis completo <b>›</b></Link></article>
    <article className="hd4-card hd4-now"><span className="hd4-kicker">PEPPE AHORA</span><h2>{training?'Recuperación contextual':'Esperando actividad'}</h2><p>{training?'Peppe actualizará esta recomendación con tus datos disponibles de entrenamiento, recuperación y nutrición.':'Cuando llegue una nueva actividad, aparecerá aquí automáticamente.'}</p><Link href="/peppe">Ver recomendación <b>›</b></Link></article></section>

    <section className="hd4-recovery"><span className="hd4-kicker">RECUPERACIÓN</span><div className="hd4-recovery-grid"><div><span>◯ GLUCOSA</span><strong>{glucose?.glucose_mg_dl??'—'}</strong><small>{glucose?`mg/dL ${glucose.trend||''}`:'Sin lectura reciente'}</small></div><div><span>◯ GARMIN</span><strong>{garmin?.status==='connected'?'CONECTADO':'—'}</strong><small>{garmin?.last_synced_at?`Último dato ${new Date(garmin.last_synced_at).toLocaleString('es-CL')}`:'Puente pendiente'}</small></div><div><span>◯ STRAVA</span><strong>{strava?.status==='connected'?'CONECTADO':'—'}</strong><small>{strava?.last_synced_at?`Última sync ${new Date(strava.last_synced_at).toLocaleString('es-CL')}`:'Sin sincronización reciente'}</small></div><p>Peppe distingue la fuente de cada dato y evita completar métricas con valores de ejemplo.</p></div></section>

    <section className="hd4-legs"><h2>¿CÓMO ESTÁN TUS PIERNAS?</h2><p>Tu respuesta ajustará las recomendaciones de mañana.</p><div className="hd4-leg-options"><button className={legs==='perfectas'?'active good':''} onClick={()=>setLegs('perfectas')}><span>☺</span><strong>Perfectas</strong><small>Me siento muy bien</small></button><button className={legs==='cargadas'?'active warn':''} onClick={()=>setLegs('cargadas')}><span>😐</span><strong>Algo cargadas</strong><small>Fatiga moderada</small></button><button className={legs==='dolor'?'active bad':''} onClick={()=>setLegs('dolor')}><span>☹</span><strong>Dolor / molestia</strong><small>Necesito atención</small></button></div><Link href="/body-map">♙ Ver mapa corporal <b>›</b></Link></section>

    <section className="hd4-sync"><span className="hd4-kicker">INTEGRACIONES</span><div>{['Garmin','Strava','LibreLink','TrainingPeaks'].map(p=><span key={p}><b>{p}</b><small>{connected.has(p.toLowerCase())?'✓ Conectado':'No conectado'}</small></span>)}<Link href="/integrations">Ver todas ›</Link></div></section>
    <footer className="hd4-quote">“ Pequeñas decisiones hoy, grandes resultados el 20 de septiembre. ” <small>MARATÓN BUENOS AIRES</small></footer>
  </section>;
}
