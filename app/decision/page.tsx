'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

function clamp(n:number,min=0,max=100){return Math.max(min,Math.min(max,n));}

export default function DecisionPage(){
  const [loading,setLoading]=useState(true);
  const [data,setData]=useState<any>({});
  const [saved,setSaved]=useState(false);

  useEffect(()=>{(async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setLoading(false);return;}
    const today=new Date().toISOString().slice(0,10);
    const [dm,sc,gl,ps,ts,ci]=await Promise.all([
      supabase.from('daily_metrics').select('*').eq('athlete_id',user.id).eq('metric_date',today).maybeSingle(),
      supabase.from('scores').select('*').eq('athlete_id',user.id).order('score_date',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('glucose_readings').select('*').eq('athlete_id',user.id).order('measured_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('planned_sessions').select('*').eq('athlete_id',user.id).gte('scheduled_at',new Date(Date.now()-6*3600e3).toISOString()).order('scheduled_at',{ascending:true}).limit(1).maybeSingle(),
      supabase.from('training_sessions').select('*').eq('athlete_id',user.id).order('started_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('*').eq('athlete_id',user.id).order('checked_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    setData({user,dm:dm.data,sc:sc.data,gl:gl.data,ps:ps.data,ts:ts.data,ci:ci.data}); setLoading(false);
  })()},[]);

  const decision=useMemo(()=>{
    const dm=data.dm||{}, ci=data.ci||{}, sc=data.sc||{};
    let readiness=sc.readiness ?? 72;
    if(dm.sleep_minutes!=null){ readiness += dm.sleep_minutes<360?-16:dm.sleep_minutes<420?-8:4; }
    if(dm.hrv_ms!=null && dm.hrv_ms<45) readiness-=8;
    if(ci.energy!=null) readiness += (ci.energy-6)*3;
    if(ci.soreness!=null) readiness -= Math.max(0,ci.soreness-4)*4;
    readiness=clamp(Math.round(readiness));
    let fuel=clamp(Math.round(sc.fuel ?? (data.gl?.glucose_mg_dl<80?55:72)));
    let hydration=clamp(Math.round(sc.hydration ?? 78));
    let environment=85;
    let recovery=clamp(Math.round(sc.recovery ?? readiness));
    const pain=Boolean(ci.pain);
    let label='GO', key='go';
    if(pain){label='RECOVER / REVIEW';key='recover';}
    else if(readiness<45){label='MODIFY';key='modify';}
    else if(readiness<68 || fuel<60){label='GO WITH CAUTION';key='caution';}
    const why:string[]=[];
    if(dm.sleep_minutes!=null) why.push(`Sueño ${Math.floor(dm.sleep_minutes/60)}h ${String(dm.sleep_minutes%60).padStart(2,'0')}m`);
    if(dm.hrv_ms!=null) why.push(`HRV ${Math.round(dm.hrv_ms)} ms`);
    if(dm.resting_hr_bpm!=null) why.push(`FC reposo ${Math.round(dm.resting_hr_bpm)} bpm`);
    if(data.gl?.glucose_mg_dl!=null) why.push(`Glucosa ${Math.round(data.gl.glucose_mg_dl)} mg/dL`);
    if(data.ps?.title) why.push(`Sesión: ${data.ps.title}`);
    if(ci.energy!=null) why.push(`Energía ${ci.energy}/10`);
    const confidence=clamp(50+[dm.sleep_minutes,dm.hrv_ms,dm.resting_hr_bpm,data.gl?.glucose_mg_dl,data.ps?.title,ci.energy].filter(v=>v!=null).length*7,55,95);
    const actions= key==='go'?['Ejecuta la sesión planificada','Usa fuel e hidratación según duración','No agregues volumen por iniciativa propia']:
      key==='caution'?['Mantén la sesión pero controla RPE y FC','Prioriza carbohidratos e hidratación','Reduce volumen si la respuesta se deteriora']:
      key==='modify'?['Reduce volumen o intensidad','Protege recuperación','Reevalúa antes del siguiente estímulo']:
      ['No fuerces intensidad','Registra dolor/molestia','Prioriza recuperación y revisión profesional si persiste'];
    return {label,key,readiness,fuel,hydration,environment,recovery,confidence,why,actions};
  },[data]);

  async function save(){ if(!data.user)return; await supabase.from('decision_snapshots').insert({athlete_id:data.user.id,decision_key:decision.key,decision_label:decision.label,readiness_score:decision.readiness,fuel_score:decision.fuel,hydration_score:decision.hydration,environment_score:decision.environment,recovery_score:decision.recovery,confidence_pct:decision.confidence,why:decision.why,actions:decision.actions,input_snapshot:{daily_metric:data.dm,glucose:data.gl,planned:data.ps,checkin:data.ci},source:'peppe-engine-v1'}); setSaved(true); }

  if(loading)return <main className="shell"><div className="card">Calculando decisión…</div></main>;
  return <main className="shell">
    <header className="topbar"><div><span className="eyebrow">PEPPE · DECISION ENGINE V1</span><h1>{decision.label}</h1><p className="muted">Una decisión única basada en estado, combustible, recuperación y plan.</p></div><Link className="ghost link-button" href="/">Hoy</Link></header>
    <section className="scores grid">
      {[['Readiness',decision.readiness],['Fuel',decision.fuel],['Hydration',decision.hydration],['Confidence',decision.confidence]].map(([n,v])=><article className="card score" key={String(n)}><span>{n}</span><strong>{v}</strong><small>/100</small></article>)}
    </section>
    <section className="grid content"><article className="card"><span className="eyebrow">¿POR QUÉ?</span><h2>Señales que movieron la decisión</h2>{decision.why.map((x:string)=><p key={x}>• {x}</p>)}</article><article className="card"><span className="eyebrow">ACCIONES</span><h2>Qué hacer ahora</h2>{decision.actions.map((x:string)=><p key={x}>• {x}</p>)}<button className="primary wide" onClick={save}>{saved?'Decisión guardada':'Guardar decisión'}</button></article></section>
    <section className="card"><span className="eyebrow">SIGUIENTE PASO</span><h2>Después del entrenamiento</h2><p>Registra la respuesta real para que Peppe compare decisión vs resultado y aprenda.</p><Link className="link-button ghost" href="/session-response">Abrir Session Response</Link></section>
  </main>;
}
