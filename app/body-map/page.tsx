'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Side='Frontal'|'Posterior';
type Zone={id:string;label:string;hint:string;side:Side;left:number;top:number;width:number;height:number};

const FRONT='https://upload.wikimedia.org/wikipedia/commons/1/13/Muscular_system.svg';
const BACK='https://upload.wikimedia.org/wikipedia/commons/9/90/Muscular_system-back.svg';

const zones:Zone[]=[
 {id:'quad-r',label:'Cuádriceps derecho',hint:'Vasto lateral / medial / recto femoral',side:'Frontal',left:48,top:54,width:14,height:22},
 {id:'quad-l',label:'Cuádriceps izquierdo',hint:'Vasto lateral / medial / recto femoral',side:'Frontal',left:35,top:54,width:14,height:22},
 {id:'chest',label:'Pectoral',hint:'Pectoral mayor / menor',side:'Frontal',left:35,top:26,width:28,height:14},
 {id:'core',label:'Abdomen / core',hint:'Recto abdominal / oblicuos',side:'Frontal',left:39,top:39,width:21,height:16},
 {id:'shoulder-r',label:'Hombro derecho',hint:'Deltoides / manguito rotador',side:'Frontal',left:60,top:25,width:10,height:12},
 {id:'shoulder-l',label:'Hombro izquierdo',hint:'Deltoides / manguito rotador',side:'Frontal',left:29,top:25,width:10,height:12},
 {id:'calf-r',label:'Pantorrilla derecha',hint:'Gastrocnemio / sóleo',side:'Posterior',left:52,top:72,width:10,height:16},
 {id:'calf-l',label:'Pantorrilla izquierda',hint:'Gastrocnemio / sóleo',side:'Posterior',left:37,top:72,width:10,height:16},
 {id:'glute-r',label:'Glúteo derecho',hint:'Glúteo mayor / medio',side:'Posterior',left:49,top:49,width:13,height:14},
 {id:'glute-l',label:'Glúteo izquierdo',hint:'Glúteo mayor / medio',side:'Posterior',left:37,top:49,width:13,height:14},
];

const causes=[
 ['🏋','Entrenamiento de fuerza intenso','hace 2 días'],
 ['🏃','Volumen de carrera alto','últimos 7 días (+32%)'],
 ['🌙','Poca recuperación','sueño debajo de lo habitual'],
];

export default function BodyMapPage(){
 const [side,setSide]=useState<Side>('Frontal');
 const [zoneId,setZoneId]=useState('quad-r');
 const [energy,setEnergy]=useState(7),[legs,setLegs]=useState(6),[motivation,setMotivation]=useState(8),[stress,setStress]=useState(4),[pain,setPain]=useState(5);
 const [onset,setOnset]=useState('Hoy'),[painType,setPainType]=useState('Dolor muscular');
 const selected=useMemo(()=>zones.find(z=>z.id===zoneId)??zones[0],[zoneId]);
 const readiness=Math.max(0,Math.min(100,Math.round((energy*.28+legs*.28+motivation*.18+(11-stress)*.12+(11-pain)*.14)*10)));
 const status=readiness>=72?'Listo para entrenar':readiness>=58?'Precaución':'Recuperación';
 const visibleZones=zones.filter(z=>z.side===side);
 const image=side==='Frontal'?FRONT:BACK;

 function pick(z:Zone){setZoneId(z.id);setSide(z.side)}

 return <main className="pm-page">
   <div className="pm-toolbar">
     <div className="pm-section-title"><strong>Cuerpo</strong><span>MAPA CORPORAL INTELIGENTE</span></div>
     <div className="pm-tools"><button>▣ &nbsp; Jue, 10 de Septiembre⌄</button><button aria-label="Notificaciones">♧</button><button aria-label="Menú">☰</button></div>
   </div>

   <section className="pm-hero">
     <div><h1>Tu cuerpo, convertido en señal.</h1><p>Marca dónde lo sientes y Peppe cruza esa señal con tu carga, tu recuperación y la sesión que viene.</p></div>
     <div className="pm-hero-status"><small>ESTADO GENERAL</small><div><b>{readiness}</b><span>/100</span></div><strong>{status}</strong><i><em style={{width:`${readiness}%`}}/></i></div>
   </section>

   <section className="pm-grid">
     <aside className="pm-card pm-checkin">
       <CardHead n="01" kicker="CHECK-IN" title="¿Cómo te sientes hoy?"/>
       <Metric label="Energía" icon="⚡" tone="yellow" value={energy} set={setEnergy}/>
       <Metric label="Piernas" icon="🏃" tone="blue" value={legs} set={setLegs}/>
       <Metric label="Motivación" icon="🔥" tone="orange" value={motivation} set={setMotivation}/>
       <Metric label="Estrés" icon="🧠" tone="purple" value={stress} set={setStress}/>
       <Metric label="Dolor / Molestias" icon="✚" tone="red" value={pain} set={setPain} danger/>
       <div className="pm-summary"><div><strong>Resumen del día</strong><span>{status}</span></div><b>{readiness}<small>/100</small></b><i><em style={{width:`${readiness}%`}}/></i><p>Se actualiza con cada cambio de sensación.</p></div>
     </aside>

     <section className="pm-card pm-map-card">
       <div className="pm-map-head"><CardHead n="02" kicker="MAPA CORPORAL" title="Selecciona la zona"/><div className="pm-segment"><button className={side==='Frontal'?'active':''} onClick={()=>setSide('Frontal')}>Frontal</button><button className={side==='Posterior'?'active':''} onClick={()=>setSide('Posterior')}>Posterior</button></div></div>
       <div className="pm-anatomy-stage">
         <div className="pm-anatomy-pair">
           <div className={`pm-body ${side==='Frontal'?'active':''}`} onClick={()=>setSide('Frontal')}>
             <img src={FRONT} alt="Anatomía muscular frontal"/>
             {side==='Frontal'&&visibleZones.map(z=><button key={z.id} aria-label={z.label} title={z.label} className={`pm-hotspot ${zoneId===z.id?'selected':''}`} style={{left:`${z.left}%`,top:`${z.top}%`,width:`${z.width}%`,height:`${z.height}%`}} onClick={e=>{e.stopPropagation();pick(z)}}/>)}
           </div>
           <div className={`pm-body ${side==='Posterior'?'active':''}`} onClick={()=>setSide('Posterior')}>
             <img src={BACK} alt="Anatomía muscular posterior"/>
             {side==='Posterior'&&visibleZones.map(z=><button key={z.id} aria-label={z.label} title={z.label} className={`pm-hotspot ${zoneId===z.id?'selected':''}`} style={{left:`${z.left}%`,top:`${z.top}%`,width:`${z.width}%`,height:`${z.height}%`}} onClick={e=>{e.stopPropagation();pick(z)}}/>)}
           </div>
         </div>
         <div className="pm-zoom"><button>☝</button><button>⊕</button><button>⊖</button><button>⟳</button></div>
       </div>
       <div className="pm-selected"><div><small>ZONA SELECCIONADA</small><strong>{selected.label}</strong><span>{selected.hint}</span></div><button onClick={()=>setSide(selected.side)}>Cambiar zona</button></div>
     </section>

     <aside className="pm-card pm-detail">
       <CardHead n="03" kicker="DETALLE DE LA MOLESTIA" title=""/>
       <div className="pm-detail-top"><div className="pm-preview"><img src={image} alt="Zona muscular"/><span/></div><div><h2>{selected.label}</h2><p>({selected.hint.split(' / ')[0]})</p><b>Dolor moderado</b></div><strong>{pain}<small>/10</small></strong></div>
       <label className="pm-field"><span>¿Desde cuándo?</span><select value={onset} onChange={e=>setOnset(e.target.value)}><option>Hoy</option><option>Ayer</option><option>2–3 días</option><option>1 semana o más</option></select></label>
       <label className="pm-field"><span>Tipo de molestia</span><select value={painType} onChange={e=>setPainType(e.target.value)}><option>Dolor muscular</option><option>Rigidez</option><option>Articular</option><option>Tendón</option></select></label>
       <label className="pm-intensity"><span>Intensidad</span><input type="range" min="1" max="10" value={pain} onChange={e=>setPain(Number(e.target.value))}/><small><span>1</span><span>5</span><span>10</span></small></label>
       <div className="pm-causes"><h3>Posibles causas <span>(según tus datos)</span></h3>{causes.map(([icon,title,meta])=><div className="pm-cause" key={title}><i>{icon}</i><div><strong>{title}</strong><span>{meta}</span></div></div>)}</div>
       <div className="pm-reco"><small>RECOMENDACIÓN PEPPE</small><div><i>🏃</i><div><strong>Modifica tu entrenamiento</strong><p>Enfoca en movilidad, técnica y trabajo complementario.</p></div><b>→</b></div></div>
       <Link href="/decision" className="pm-cta">Ver ejercicios recomendados <span>→</span></Link>
     </aside>
   </section>
   <div className="pm-credit">Anatomía: Termininja · Wikimedia Commons · CC BY-SA 3.0</div>
 </main>
}

function CardHead({n,kicker,title}:{n:string;kicker:string;title:string}){return <div className="pm-cardhead"><span>{n}</span><div><small>{kicker}</small>{title&&<h2>{title}</h2>}</div></div>}
function Metric({label,icon,tone,value,set,danger=false}:{label:string;icon:string;tone:string;value:number;set:(n:number)=>void;danger?:boolean}){return <label className={`pm-metric ${danger?'danger':''}`}><div><i className={tone}>{icon}</i><b>{label}</b><strong>{value}</strong></div><input type="range" min="1" max="10" value={value} onChange={e=>set(Number(e.target.value))}/><small><span>1</span><span>5</span><span>10</span></small></label>}
