'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type View = 'Frontal' | 'Posterior';
type Zone = { id:string; label:string; side:View; hint:string; family:string };

const zones: Zone[] = [
  {id:'shoulder-r',label:'Hombro derecho',side:'Frontal',hint:'Deltoides / manguito rotador',family:'Hombro'},
  {id:'shoulder-l',label:'Hombro izquierdo',side:'Frontal',hint:'Deltoides / manguito rotador',family:'Hombro'},
  {id:'chest',label:'Pectoral',side:'Frontal',hint:'Pectoral mayor / menor',family:'Torso'},
  {id:'core',label:'Abdomen / core',side:'Frontal',hint:'Recto abdominal / oblicuos',family:'Core'},
  {id:'adductor-r',label:'Aductor derecho',side:'Frontal',hint:'Aductores / gracilis',family:'Muslo'},
  {id:'adductor-l',label:'Aductor izquierdo',side:'Frontal',hint:'Aductores / gracilis',family:'Muslo'},
  {id:'quad-r',label:'Cuádriceps derecho',side:'Frontal',hint:'Vasto lateral / medial / recto femoral',family:'Muslo'},
  {id:'quad-l',label:'Cuádriceps izquierdo',side:'Frontal',hint:'Vasto lateral / medial / recto femoral',family:'Muslo'},
  {id:'knee-r',label:'Rodilla derecha',side:'Frontal',hint:'Región anterior / patelar',family:'Rodilla'},
  {id:'knee-l',label:'Rodilla izquierda',side:'Frontal',hint:'Región anterior / patelar',family:'Rodilla'},
  {id:'shin-r',label:'Tibial derecho',side:'Frontal',hint:'Tibial anterior',family:'Pierna'},
  {id:'shin-l',label:'Tibial izquierdo',side:'Frontal',hint:'Tibial anterior',family:'Pierna'},
  {id:'upper-back',label:'Espalda alta',side:'Posterior',hint:'Trapecio / romboides',family:'Espalda'},
  {id:'lower-back',label:'Espalda baja',side:'Posterior',hint:'Lumbar / erectores espinales',family:'Espalda'},
  {id:'glute-r',label:'Glúteo derecho',side:'Posterior',hint:'Glúteo mayor / medio',family:'Cadera'},
  {id:'glute-l',label:'Glúteo izquierdo',side:'Posterior',hint:'Glúteo mayor / medio',family:'Cadera'},
  {id:'ham-r',label:'Isquiotibial derecho',side:'Posterior',hint:'Bíceps femoral / semitendinoso',family:'Muslo'},
  {id:'ham-l',label:'Isquiotibial izquierdo',side:'Posterior',hint:'Bíceps femoral / semitendinoso',family:'Muslo'},
  {id:'calf-r',label:'Pantorrilla derecha',side:'Posterior',hint:'Gastrocnemio / sóleo',family:'Pierna'},
  {id:'calf-l',label:'Pantorrilla izquierda',side:'Posterior',hint:'Gastrocnemio / sóleo',family:'Pierna'},
  {id:'achilles-r',label:'Aquiles derecho',side:'Posterior',hint:'Tendón de Aquiles',family:'Tendón'},
  {id:'achilles-l',label:'Aquiles izquierdo',side:'Posterior',hint:'Tendón de Aquiles',family:'Tendón'},
];

const history = [3,4,6,5,6,7,5];

export default function BodyMapPage(){
  const [view,setView]=useState<View>('Frontal');
  const [zoneId,setZoneId]=useState('quad-r');
  const [energy,setEnergy]=useState(7);
  const [legs,setLegs]=useState(6);
  const [motivation,setMotivation]=useState(8);
  const [stress,setStress]=useState(4);
  const [intensity,setIntensity]=useState(5);
  const [onset,setOnset]=useState('Hoy');
  const [painType,setPainType]=useState('Muscular');

  const selected=useMemo(()=>zones.find(z=>z.id===zoneId)??zones[6],[zoneId]);
  const readiness=Math.max(0,Math.min(100,Math.round((energy*.28+legs*.28+motivation*.18+(11-stress)*.12+(11-intensity)*.14)*10)));
  const decision=intensity>=7||legs<=4?'MODIFICA':readiness>=72?'LISTO':'CAUTION';
  const severity=intensity>=7?'Alta':intensity>=4?'Moderada':'Leve';

  function selectZone(id:string){
    const next=zones.find(z=>z.id===id); if(!next)return; setZoneId(id); setView(next.side);
  }

  return <main className="bi-page">
    <div className="bi-topline"><div className="bi-logo"><span>p</span><b>Peppe</b><small>BODY INTELLIGENCE</small></div><div className="bi-top-actions"><Link href="/">Hoy</Link><Link href="/history">Historial</Link><Link href="/body">Composición corporal</Link></div></div>

    <header className="bi-hero">
      <div><span className="bi-eyebrow">READINESS · MUSCLE MAP · RECOVERY</span><h1>Tu cuerpo, convertido en señal.</h1><p>Marca dónde lo sientes y Peppe cruza esa señal con tu carga, tu recuperación y la sesión que viene.</p></div>
      <div className="bi-status"><span>DECISIÓN ACTUAL</span><strong className={`decision-${decision.toLowerCase()}`}>{decision}</strong><small>{readiness}% readiness · dolor {intensity}/10</small></div>
    </header>

    <section className="bi-main-grid">
      <aside className="bi-card bi-checkin">
        <div className="bi-card-head"><span>01</span><div><small>CHECK-IN</small><h2>¿Cómo te sientes hoy?</h2></div></div>
        <Metric label="Energía" icon="⚡" value={energy} onChange={setEnergy}/>
        <Metric label="Piernas" icon="◒" value={legs} onChange={setLegs}/>
        <Metric label="Motivación" icon="↗" value={motivation} onChange={setMotivation}/>
        <Metric label="Estrés" icon="◉" value={stress} onChange={setStress}/>
        <Metric label="Dolor / molestias" icon="✣" value={intensity} onChange={setIntensity} danger/>
        <div className="bi-readiness"><div><span>ESTADO DEL DÍA</span><b>{decision==='LISTO'?'Listo para entrenar':decision==='MODIFICA'?'Modifica la sesión':'Precaución'}</b></div><strong>{readiness}</strong><div className="bi-progress"><i style={{width:`${readiness}%`}}/></div><small>Se actualiza con cada cambio de sensación.</small></div>
      </aside>

      <section className="bi-card bi-anatomy">
        <div className="bi-card-head anatomy-head"><span>02</span><div><small>MAPA CORPORAL</small><h2>Selecciona la zona</h2></div><div className="bi-toggle"><button className={view==='Frontal'?'active':''} onClick={()=>setView('Frontal')}>Frontal</button><button className={view==='Posterior'?'active':''} onClick={()=>setView('Posterior')}>Posterior</button></div></div>
        <div className="bi-stage"><Anatomy view={view} selected={zoneId} onSelect={selectZone}/></div>
        <div className="bi-selected"><div><small>ZONA SELECCIONADA</small><strong>{selected.label}</strong><span>{selected.hint}</span></div><div className="bi-zone-meta"><span>{selected.family}</span><b>{severity}</b></div></div>
      </section>

      <aside className="bi-card bi-detail">
        <div className="bi-card-head"><span>03</span><div><small>DETALLE</small><h2>{selected.label}</h2></div></div>
        <div className="bi-detail-summary"><span className={`bi-severity s${Math.min(intensity,9)}`}>Dolor {severity.toLowerCase()}</span><strong>{intensity}<small>/10</small></strong></div>
        <label className="bi-field"><span>¿Desde cuándo?</span><select value={onset} onChange={e=>setOnset(e.target.value)}><option>Hoy</option><option>Ayer</option><option>2–3 días</option><option>1 semana o más</option></select></label>
        <label className="bi-field"><span>Tipo de molestia</span><select value={painType} onChange={e=>setPainType(e.target.value)}><option>Muscular</option><option>Articular</option><option>Tendón</option><option>Rigidez</option><option>Otro</option></select></label>
        <div className="bi-cause"><small>PATRONES A REVISAR</small><div><b>01</b><span><strong>Carga reciente</strong><em>Volumen e intensidad de los últimos 7 días</em></span></div><div><b>02</b><span><strong>Recuperación</strong><em>Sueño, HRV y fatiga acumulada</em></span></div><div><b>03</b><span><strong>Actividad complementaria</strong><em>Fuerza, bici, pádel u otro estímulo</em></span></div></div>
        <div className="bi-reco"><small>RECOMENDACIÓN PEPPE</small><strong>{intensity>=7?'Reduce carga y evita intensidad.':intensity>=4?'Protege la zona y modifica la sesión.':'Puedes entrenar, monitorizando la evolución.'}</strong><p>La decisión final se cruza con tu plan, carga, sueño y evolución de la molestia.</p></div>
        <Link className="bi-primary" href="/decision">Ver decisión completa <span>→</span></Link>
      </aside>
    </section>

    <section className="bi-lower-grid">
      <article className="bi-card bi-exercises"><div className="bi-section-title"><small>INTERVENCIÓN</small><h2>Qué hacer ahora</h2></div><div className="bi-tabs"><button className="active">Movilidad</button><button>Fuerza</button><button>Estabilidad</button><button>Liberación</button></div><Exercise n="01" title="Movilidad específica" meta="2–4 min · rango cómodo"/><Exercise n="02" title="Activación controlada" meta="2–3 series · carga baja"/><Exercise n="03" title="Isométricos / estabilidad" meta="30–45 s · según zona"/><button className="bi-secondary">Marcar rutina como completada</button></article>
      <article className="bi-card bi-pattern"><div className="bi-section-title"><small>CONTEXTO</small><h2>Relación con tu entrenamiento</h2></div><div className="bi-week"><span>J<br/><b>27</b></span><span>V<br/><b>28</b></span><span>S<br/><b>29</b></span><span>D<br/><b>30</b></span><span>L<br/><b>31</b></span><span className="today">M<br/><b>01</b></span><span>X<br/><b>02</b></span></div><div className="bi-chart"><div className="bi-chart-label"><span>CARGA</span><b>Patrón alto</b></div><div className="bi-bars">{[42,78,64,72,55,38,24].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></div><div className="bi-pattern-note"><span>↗</span><div><strong>Patrón para investigar</strong><p>La molestia aparece cerca de días con mayor carga y menor recuperación. Peppe lo validará con tu historial real.</p></div></div></article>
      <article className="bi-card bi-trend"><div className="bi-section-title"><small>EVOLUCIÓN</small><h2>Cómo viene cambiando</h2></div><div className="bi-linechart"><svg viewBox="0 0 420 160" preserveAspectRatio="none"><polyline points={history.map((v,i)=>`${18+i*64},${142-v*16}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="3"/><line x1="0" y1="142" x2="420" y2="142" className="axis"/>{history.map((v,i)=><circle key={i} cx={18+i*64} cy={142-v*16} r={i===history.length-1?6:4}/>)}</svg></div><div className="bi-trend-row"><span>Hoy</span><strong>{intensity}/10</strong></div><div className="bi-trend-row"><span>Zona</span><b>{selected.label}</b></div><div className="bi-trend-row"><span>Tipo</span><b>{painType}</b></div><p className="bi-footnote">El valor real será la tendencia: recurrencia, duración, lado, músculo y relación con la carga.</p></article>
    </section>
  </main>
}

function Metric({label,icon,value,onChange,danger=false}:{label:string;icon:string;value:number;onChange:(v:number)=>void;danger?:boolean}){return <label className={`bi-metric ${danger?'danger':''}`}><div><span className="bi-icon">{icon}</span><b>{label}</b><strong>{value}</strong></div><input type="range" min="1" max="10" value={value} onChange={e=>onChange(Number(e.target.value))}/><small><span>1</span><span>5</span><span>10</span></small></label>}
function Exercise({n,title,meta}:{n:string;title:string;meta:string}){return <div className="bi-exercise"><b>{n}</b><span><strong>{title}</strong><small>{meta}</small></span><button aria-label={title}>▶</button></div>}
function ZonePath({id,d,selected,onSelect}:{id:string;d:string;selected:string;onSelect:(id:string)=>void}){return <path d={d} className={`bi-muscle ${selected===id?'selected':''}`} onClick={()=>onSelect(id)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onSelect(id)}}/>}

function Anatomy({view,selected,onSelect}:{view:View;selected:string;onSelect:(id:string)=>void}){
  return <svg className="bi-human" viewBox="0 0 360 760" role="img" aria-label={`Anatomía ${view.toLowerCase()}`}>
    <defs><linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#303b48"/><stop offset="1" stopColor="#111924"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <ellipse cx="180" cy="48" rx="35" ry="42" fill="url(#skin)" stroke="#4a5664"/><path d="M165 87h30l11 28h-52z" fill="#222d38"/>
    <path d="M111 118Q180 88 249 118l22 145-54 78h-74l-54-78z" fill="#1a2530" stroke="#3b4856"/>
    <path d="M104 126Q77 139 63 187L43 336l27 4 24-130 31-62z" fill="#1a2530" stroke="#3b4856"/><path d="M256 126q27 13 41 61l20 149-27 4-24-130-31-62z" fill="#1a2530" stroke="#3b4856"/>
    <path d="M129 333h45l-9 188-22 196H99l16-198z" fill="#1a2530" stroke="#3b4856"/><path d="M231 333h-45l9 188 22 196h44l-16-198z" fill="#1a2530" stroke="#3b4856"/>
    {view==='Frontal'?<>
      <ZonePath id="shoulder-l" selected={selected} onSelect={onSelect} d="M104 126q20-20 42-13l-8 54-31 17-23-25z"/>
      <ZonePath id="shoulder-r" selected={selected} onSelect={onSelect} d="M256 126q-20-20-42-13l8 54 31 17 23-25z"/>
      <ZonePath id="chest" selected={selected} onSelect={onSelect} d="M143 123q37-17 74 0l-2 77q-35 27-70 0z"/>
      <ZonePath id="core" selected={selected} onSelect={onSelect} d="M151 207h58l10 98-39 31-39-31z"/>
      <ZonePath id="adductor-l" selected={selected} onSelect={onSelect} d="M143 344l31-2-12 128-27-17z"/>
      <ZonePath id="adductor-r" selected={selected} onSelect={onSelect} d="M217 344l-31-2 12 128 27-17z"/>
      <ZonePath id="quad-l" selected={selected} onSelect={onSelect} d="M116 347l29-7 17 132-19 56-31-18z"/>
      <ZonePath id="quad-r" selected={selected} onSelect={onSelect} d="M244 347l-29-7-17 132 19 56 31-18z"/>
      <ZonePath id="knee-l" selected={selected} onSelect={onSelect} d="M112 510l31 18-4 46-31 2z"/>
      <ZonePath id="knee-r" selected={selected} onSelect={onSelect} d="M248 510l-31 18 4 46 31 2z"/>
      <ZonePath id="shin-l" selected={selected} onSelect={onSelect} d="M108 581h30l-8 124h-28z"/>
      <ZonePath id="shin-r" selected={selected} onSelect={onSelect} d="M252 581h-30l8 124h28z"/>
    </>:<>
      <ZonePath id="upper-back" selected={selected} onSelect={onSelect} d="M124 119q56-25 112 0l-16 93-40 23-40-23z"/>
      <ZonePath id="lower-back" selected={selected} onSelect={onSelect} d="M144 216h72l12 86-48 35-48-35z"/>
      <ZonePath id="glute-l" selected={selected} onSelect={onSelect} d="M129 320q28-9 46 20l-10 67-43 11-13-54z"/>
      <ZonePath id="glute-r" selected={selected} onSelect={onSelect} d="M231 320q-28-9-46 20l10 67 43 11 13-54z"/>
      <ZonePath id="ham-l" selected={selected} onSelect={onSelect} d="M120 419l45-7-10 116-17 43-31-9z"/>
      <ZonePath id="ham-r" selected={selected} onSelect={onSelect} d="M240 419l-45-7 10 116 17 43 31-9z"/>
      <ZonePath id="calf-l" selected={selected} onSelect={onSelect} d="M107 576l31 2 11 64-22 55-28-6z"/>
      <ZonePath id="calf-r" selected={selected} onSelect={onSelect} d="M253 576l-31 2-11 64 22 55 28-6z"/>
      <ZonePath id="achilles-l" selected={selected} onSelect={onSelect} d="M113 682h17l4 35h-24z"/>
      <ZonePath id="achilles-r" selected={selected} onSelect={onSelect} d="M247 682h-17l-4 35h24z"/>
    </>}
    <line x1="180" y1="112" x2="180" y2="716" className="bi-midline"/>
  </svg>
}
