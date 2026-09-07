'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

const MARKERS = [
  ['Hemoglobina','g/dL','hematology'],['Ferritina','ng/mL','iron'],['Hierro','µg/dL','iron'],['Saturación transferrina','%','iron'],
  ['Glucosa ayuno','mg/dL','metabolic'],['HbA1c','%','metabolic'],['Creatinina','mg/dL','renal'],['Sodio','mmol/L','electrolytes'],['Potasio','mmol/L','electrolytes'],
  ['AST','U/L','liver'],['ALT','U/L','liver'],['TSH','mUI/L','thyroid'],['T4 libre','ng/dL','thyroid'],['Vitamina B12','pg/mL','vitamins'],['Folato','ng/mL','vitamins'],['Vitamina D','ng/mL','vitamins'],
  ['Colesterol total','mg/dL','lipids'],['LDL','mg/dL','lipids'],['HDL','mg/dL','lipids'],['Triglicéridos','mg/dL','lipids']
] as const;

function addMonths(date:string, months:number){const d=new Date(date);d.setMonth(d.getMonth()+months);return d;}
function fmt(d:Date|string){return new Date(d).toLocaleDateString('es-CL');}
function flagLabel(flag?:string|null){
  if(!flag)return 'Dentro de referencia';
  if(flag==='high')return 'Sobre referencia';
  if(flag==='low')return 'Bajo referencia';
  if(flag==='insufficient')return 'Insuficiente';
  if(flag==='borderline')return 'Limítrofe';
  if(flag==='above_optimal')return 'Sobre óptimo';
  return flag.replaceAll('_',' ');
}

export default function BiochemistryPage(){
  const [user,setUser]=useState<any>(null);
  const [panels,setPanels]=useState<any[]>([]);
  const [documents,setDocuments]=useState<any[]>([]);
  const [values,setValues]=useState<Record<string,string>>({});
  const [cadence,setCadence]=useState<3|6>(3);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const [pdf,setPdf]=useState<File|null>(null);
  const [uploading,setUploading]=useState(false);
  const [uploadMessage,setUploadMessage]=useState('');

  async function load(uid:string){
    const [{data:panelData},{data:docData}]=await Promise.all([
      supabase.from('lab_panels').select('*,lab_results(*)').eq('athlete_id',uid).order('collected_at',{ascending:false}).limit(12),
      supabase.from('lab_documents').select('*').eq('athlete_id',uid).order('created_at',{ascending:false}).limit(12)
    ]);
    setPanels(panelData||[]);
    setDocuments(docData||[]);
  }

  useEffect(()=>{(async()=>{
    const {data:{user}}=await supabase.auth.getUser(); setUser(user);
    const stored=Number(localStorage.getItem('peppe_lab_cadence_months')||3); setCadence(stored===6?6:3);
    if(user) await load(user.id);
  })();},[]);

  const latest=panels[0];
  const previous=panels[1];
  const nextDue=latest?addMonths(latest.collected_at,cadence):null;
  const maxDue=latest?addMonths(latest.collected_at,6):null;
  const now=new Date();
  const status=!latest?'missing':nextDue&&now>=nextDue?'due':maxDue&&now>=addMonths(latest.collected_at,5)?'soon':'ok';

  const previousMap=useMemo(()=>Object.fromEntries((previous?.lab_results||[]).map((r:any)=>[r.analyte,r.value_numeric])),[previous]);
  const latestMap=useMemo(()=>Object.fromEntries((latest?.lab_results||[]).map((r:any)=>[r.analyte,r.value_numeric])),[latest]);
  const latestResults=useMemo(()=>[...(latest?.lab_results||[])].sort((a:any,b:any)=>String(a.clinical_category||'').localeCompare(String(b.clinical_category||''))),[latest]);

  function setCadenceSafe(v:3|6){setCadence(v);localStorage.setItem('peppe_lab_cadence_months',String(v));}

  async function savePanel(){
    if(!user||saving)return;
    const filled=MARKERS.filter(([name])=>values[name]?.trim()!=='');
    if(!filled.length){setMessage('Ingresa al menos un marcador.');return;}
    setSaving(true); setMessage('');
    const {data:panel,error}=await supabase.from('lab_panels').insert({athlete_id:user.id,collected_at:new Date().toISOString(),panel_name:'Perfil bioquímico',source:'manual'}).select().single();
    if(error||!panel){setMessage('No pudimos guardar el panel.');setSaving(false);return;}
    const rows=filled.map(([name,unit,category])=>({panel_id:panel.id,athlete_id:user.id,analyte:name,value_numeric:Number(values[name]),unit,clinical_category:category}));
    const {error:rowsError}=await supabase.from('lab_results').insert(rows as any[]);
    if(rowsError){setMessage('El panel se creó, pero algunos resultados no pudieron guardarse.');setSaving(false);return;}
    setValues({}); setMessage(`Perfil guardado. Próxima comparación recomendada en ${cadence} meses.`); await load(user.id); setSaving(false);
  }

  async function uploadPdf(){
    if(!user||!pdf||uploading)return;
    if(pdf.type!=='application/pdf'){setUploadMessage('Adjunta un archivo PDF.');return;}
    if(pdf.size>15*1024*1024){setUploadMessage('El PDF supera el máximo de 15 MB.');return;}
    setUploading(true); setUploadMessage('');
    const safeName=pdf.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${user.id}/${Date.now()}-${safeName}`;
    const {error:uploadError}=await supabase.storage.from('lab-reports').upload(path,pdf,{contentType:'application/pdf',upsert:false});
    if(uploadError){setUploadMessage(`No pudimos adjuntar el PDF: ${uploadError.message}`);setUploading(false);return;}
    const {error:docError}=await supabase.from('lab_documents').insert({athlete_id:user.id,file_name:pdf.name,storage_path:path,mime_type:'application/pdf',status:'uploaded'});
    if(docError){setUploadMessage('El PDF se subió, pero no pudimos registrarlo en tu historial.');setUploading(false);return;}
    setPdf(null); setUploadMessage('PDF adjuntado correctamente. Quedó guardado en tu perfil para lectura y comparación.'); await load(user.id); setUploading(false);
  }

  async function openDocument(doc:any){
    const {data,error}=await supabase.storage.from('lab-reports').createSignedUrl(doc.storage_path,60);
    if(error||!data?.signedUrl){setUploadMessage('No pudimos abrir este PDF.');return;}
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }

  return <main className="shell">
    <header className="topbar"><div><span className="eyebrow">PEPPE · PERFIL BIOQUÍMICO</span><h1>Tu laboratorio, comparado en el tiempo.</h1><p className="muted">Adjunta el PDF completo o carga marcadores manualmente. Peppe conserva cada panel, compara tendencias y te vuelve a pedir una actualización a los 3 o 6 meses.</p></div><Link className="ghost link-button" href="/history">Historial completo</Link></header>

    <section className="grid scores">
      <article className="card score"><span>Último panel</span><strong>{latest?fmt(latest.collected_at):'—'}</strong><small>{latest?`${latest.lab_results?.length||0} marcadores disponibles`:'Aún no hay baseline bioquímico'}</small></article>
      <article className="card score"><span>Próximo control</span><strong>{nextDue?fmt(nextDue):'—'}</strong><small>Ciclo elegido: {cadence} meses</small></article>
      <article className="card score"><span>Estado</span><strong>{status==='missing'?'BASELINE':status==='due'?'ACTUALIZAR':status==='soon'?'PRONTO':'VIGENTE'}</strong><small>{status==='due'?'Ya corresponde cargar un nuevo perfil para comparar.':status==='soon'?'Se acerca la ventana de actualización.':'Sin acción necesaria hoy.'}</small></article>
      <article className="card score"><span>PDF adjuntos</span><strong>{documents.length}</strong><small>Informes guardados en tu perfil</small></article>
    </section>

    {latest&&<section className="card" style={{marginBottom:16}}><span className="eyebrow">ÚLTIMO EXAMEN CARGADO</span><h2>{fmt(latest.collected_at)} · {latest.panel_name||'Perfil bioquímico'}</h2><p className="muted">{latest.provider?`${latest.provider} · `:''}{latestResults.length} resultados guardados.</p><div className="form-grid">{latestResults.map((r:any)=><div key={r.id} style={{borderTop:'1px solid rgba(17,17,15,.18)',padding:'14px 0'}}><strong>{r.analyte}</strong><div style={{fontSize:'1.15rem',marginTop:4}}>{r.value_numeric??r.value_text??'—'} {r.unit||''}</div><small>{flagLabel(r.flag)}{r.reference_low!=null||r.reference_high!=null||r.reference_text?` · Ref. ${r.reference_text||`${r.reference_low??''}${r.reference_low!=null&&r.reference_high!=null?'–':''}${r.reference_high??''}`}`:''}</small></div>)}</div></section>}

    <section className="card" style={{marginBottom:16}}><span className="eyebrow">ADJUNTAR INFORME</span><h2>Subir examen en PDF</h2><p className="muted">Adjunta el informe original del laboratorio. Máximo 15 MB. El archivo queda privado y asociado a tu usuario.</p><div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><input type="file" accept="application/pdf,.pdf" onChange={e=>setPdf(e.target.files?.[0]||null)}/><button className="primary" disabled={!pdf||uploading} onClick={uploadPdf}>{uploading?'Subiendo…':'Adjuntar PDF'}</button></div>{pdf&&<p className="muted" style={{marginBottom:0}}>Seleccionado: {pdf.name}</p>}{uploadMessage&&<div className="notice">{uploadMessage}</div>}{documents.length>0&&<div style={{marginTop:16}}>{documents.map((d:any)=><div key={d.id} style={{borderTop:'1px solid rgba(17,17,15,.18)',padding:'12px 0',display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><strong>{d.file_name}</strong><div><small>{fmt(d.created_at)} · PDF privado</small></div></div><button className="ghost" onClick={()=>openDocument(d)}>Abrir PDF</button></div>)}</div>}</section>

    {(status==='missing'||status==='due'||status==='soon')&&<section className="notice" style={{marginBottom:16}}>{status==='missing'?'Crea tu primer baseline bioquímico.':status==='due'?`Han pasado ${cadence} meses desde el último panel. Carga uno nuevo para comparar cambios.`:'Tu próximo control bioquímico se acerca. Puedes esperar o cargarlo antes si tu equipo clínico lo indica.'}</section>}

    <section className="card" style={{marginBottom:16}}><span className="eyebrow">FRECUENCIA</span><h2>¿Cuándo quieres que Peppe te lo vuelva a pedir?</h2><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className={cadence===3?'primary':'ghost'} onClick={()=>setCadenceSafe(3)}>Cada 3 meses</button><button className={cadence===6?'primary':'ghost'} onClick={()=>setCadenceSafe(6)}>Cada 6 meses</button></div><p className="muted">3 meses sirve para seguimiento más estrecho. 6 meses es el máximo de referencia dentro de Peppe. La frecuencia clínica real debe ajustarse con tu profesional de salud.</p></section>

    <section className="card"><span className="eyebrow">CARGA MANUAL · OPCIONAL</span><h2>Ingresar marcadores</h2><p className="muted">Úsalo sólo si no tienes el PDF o quieres agregar un resultado puntual.</p><div className="form-grid">
      {MARKERS.map(([name,unit])=><label key={name}>{name} <small>{unit}</small><input inputMode="decimal" value={values[name]||''} onChange={e=>setValues({...values,[name]:e.target.value})} placeholder="—"/></label>)}
    </div><button className="primary wide" disabled={saving} onClick={savePanel}>{saving?'Guardando…':'Guardar perfil y programar próxima comparación'}</button>{message&&<div className="notice">{message}</div>}</section>

    <section className="card" style={{marginTop:16}}><span className="eyebrow">COMPARACIÓN LONGITUDINAL</span><h2>{latest&&previous?'Último panel vs anterior':'Necesitamos al menos 2 paneles'}</h2>
      {latest&&previous?<div className="form-grid">{MARKERS.map(([name,unit])=>{const a=latestMap[name],b=previousMap[name];if(a==null&&b==null)return null;const delta=a!=null&&b!=null?Number(a)-Number(b):null;return <div key={name} style={{borderTop:'1px solid rgba(17,17,15,.18)',padding:'14px 0'}}><strong>{name}</strong><div>{a??'—'} {unit}</div><small>{b!=null?`Anterior ${b} ${unit}`:'Sin valor anterior'}{delta!=null?` · Δ ${delta>0?'+':''}${delta.toFixed(2)}`:''}</small></div>})}</div>:<p className="muted">Cuando cargues un segundo control, Peppe mostrará la variación marcador por marcador y mantendrá todo el histórico.</p>}
    </section>

    <section className="card" style={{marginTop:16}}><span className="eyebrow">HISTORIAL</span><h2>{panels.length} paneles guardados</h2>{panels.map((p:any)=><div key={p.id} style={{borderTop:'1px solid rgba(17,17,15,.18)',padding:'14px 0'}}><strong>{fmt(p.collected_at)} · {p.panel_name||'Perfil bioquímico'}</strong><p className="muted" style={{marginBottom:0}}>{(p.lab_results||[]).map((r:any)=>`${r.analyte}: ${r.value_numeric??r.value_text??'—'} ${r.unit||''}`).join(' · ')||'Sin resultados'}</p></div>)}</section>
  </main>;
}
