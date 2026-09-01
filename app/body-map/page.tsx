'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Zone = {
  id: string;
  label: string;
  side: 'Frontal' | 'Posterior';
  hint: string;
};

const zones: Zone[] = [
  { id: 'shoulder-r', label: 'Hombro derecho', side: 'Frontal', hint: 'Deltoides / manguito' },
  { id: 'chest', label: 'Pectoral', side: 'Frontal', hint: 'Pectoral mayor' },
  { id: 'core', label: 'Abdomen / core', side: 'Frontal', hint: 'Recto abdominal / oblicuos' },
  { id: 'quad-r', label: 'Cuádriceps derecho', side: 'Frontal', hint: 'Vasto lateral / recto femoral' },
  { id: 'quad-l', label: 'Cuádriceps izquierdo', side: 'Frontal', hint: 'Vasto lateral / recto femoral' },
  { id: 'knee-r', label: 'Rodilla derecha', side: 'Frontal', hint: 'Región anterior' },
  { id: 'calf-r', label: 'Pantorrilla derecha', side: 'Frontal', hint: 'Gemelo / sóleo' },
  { id: 'calf-l', label: 'Pantorrilla izquierda', side: 'Frontal', hint: 'Gemelo / sóleo' },
  { id: 'upper-back', label: 'Espalda alta', side: 'Posterior', hint: 'Trapecio / romboides' },
  { id: 'lower-back', label: 'Espalda baja', side: 'Posterior', hint: 'Lumbar' },
  { id: 'glute-r', label: 'Glúteo derecho', side: 'Posterior', hint: 'Glúteo mayor / medio' },
  { id: 'ham-r', label: 'Isquiotibial derecho', side: 'Posterior', hint: 'Bíceps femoral / semitendinoso' },
  { id: 'ham-l', label: 'Isquiotibial izquierdo', side: 'Posterior', hint: 'Bíceps femoral / semitendinoso' },
  { id: 'achilles-r', label: 'Aquiles derecho', side: 'Posterior', hint: 'Tendón de Aquiles' },
];

export default function BodyMapPage() {
  const [view, setView] = useState<'Frontal' | 'Posterior'>('Frontal');
  const [zoneId, setZoneId] = useState('quad-r');
  const [intensity, setIntensity] = useState(5);
  const [energy, setEnergy] = useState(7);
  const [legs, setLegs] = useState(6);
  const [motivation, setMotivation] = useState(8);
  const [stress, setStress] = useState(4);

  const selected = useMemo(() => zones.find((z) => z.id === zoneId) ?? zones[3], [zoneId]);
  const readiness = Math.max(0, Math.min(100, Math.round((energy * .28 + legs * .28 + motivation * .18 + (11 - stress) * .12 + (11 - intensity) * .14) * 10)));
  const decision = intensity >= 7 || legs <= 4 ? 'MODIFICA' : readiness >= 72 ? 'LISTO PARA ENTRENAR' : 'CAUTION';

  function selectZone(id: string) {
    setZoneId(id);
    const z = zones.find((item) => item.id === id);
    if (z) setView(z.side);
  }

  return (
    <main className="bodymap-shell">
      <header className="bodymap-header">
        <div>
          <span className="bodymap-brand">PEPPE · BODY INTELLIGENCE</span>
          <h1>¿Dónde lo sientes hoy?</h1>
          <p>Selecciona la zona, marca intensidad y Peppe la cruza con carga, recuperación y entrenamiento.</p>
        </div>
        <Link href="/body" className="bodymap-back">Composición corporal</Link>
      </header>

      <section className="bodymap-grid">
        <article className="bodymap-panel wellness-panel">
          <span className="bodymap-kicker">CHECK-IN</span>
          <h2>¿Cómo te sientes hoy?</h2>
          <Metric label="Energía" icon="⚡" value={energy} onChange={setEnergy} />
          <Metric label="Piernas" icon="🦵" value={legs} onChange={setLegs} />
          <Metric label="Motivación" icon="🔥" value={motivation} onChange={setMotivation} />
          <Metric label="Estrés" icon="◉" value={stress} onChange={setStress} />
          <Metric label="Dolor / molestias" icon="✣" value={intensity} onChange={setIntensity} danger />

          <div className="readiness-card">
            <span>ESTADO GENERAL</span>
            <strong>{decision}</strong>
            <div className="readiness-track"><i style={{ width: `${readiness}%` }} /></div>
            <small>{readiness}% · decisión dinámica</small>
          </div>
        </article>

        <article className="bodymap-panel anatomy-panel">
          <div className="anatomy-title-row">
            <div><span className="bodymap-kicker">MAPA CORPORAL</span><h2>Selecciona la zona</h2></div>
            <div className="view-toggle"><button className={view === 'Frontal' ? 'active' : ''} onClick={() => setView('Frontal')}>Frontal</button><button className={view === 'Posterior' ? 'active' : ''} onClick={() => setView('Posterior')}>Posterior</button></div>
          </div>

          <div className="human-stage">
            <svg className="human-map" viewBox="0 0 260 560" role="img" aria-label={`Mapa corporal ${view.toLowerCase()}`}>
              <defs>
                <linearGradient id="bodyGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#566171"/><stop offset="1" stopColor="#202a37"/></linearGradient>
              </defs>
              <circle cx="130" cy="55" r="34" fill="url(#bodyGlow)" stroke="#7d8999"/>
              <rect x="116" y="86" width="28" height="32" rx="10" fill="#424d5c"/>
              <path d="M83 112 Q130 92 177 112 L191 230 Q165 267 130 274 Q95 267 69 230 Z" fill="#303b49" stroke="#758091"/>
              <path d="M69 123 Q45 137 38 177 L31 270 Q32 290 46 291 L59 207 L82 153 Z" fill="#33404f" stroke="#6f7b8b"/>
              <path d="M191 123 Q215 137 222 177 L229 270 Q228 290 214 291 L201 207 L178 153 Z" fill="#33404f" stroke="#6f7b8b"/>
              <path d="M93 269 L122 270 L116 425 Q111 492 99 540 L74 540 Q82 459 76 393 Z" fill="#34404d" stroke="#6f7b8b"/>
              <path d="M167 269 L138 270 L144 425 Q149 492 161 540 L186 540 Q178 459 184 393 Z" fill="#34404d" stroke="#6f7b8b"/>

              {view === 'Frontal' ? <>
                <Zone id="shoulder-r" selected={zoneId} d="M157 111 Q180 111 191 131 L180 162 L158 145 Z" onSelect={selectZone}/>
                <Zone id="chest" selected={zoneId} d="M91 126 Q130 108 169 126 L164 180 Q130 194 96 180 Z" onSelect={selectZone}/>
                <Zone id="core" selected={zoneId} d="M104 184 L156 184 L158 244 Q130 262 102 244 Z" onSelect={selectZone}/>
                <Zone id="quad-l" selected={zoneId} d="M80 285 L119 280 L113 386 L83 385 Z" onSelect={selectZone}/>
                <Zone id="quad-r" selected={zoneId} d="M141 280 L180 285 L177 385 L147 386 Z" onSelect={selectZone}/>
                <Zone id="knee-r" selected={zoneId} d="M148 386 L177 386 L175 420 L146 420 Z" onSelect={selectZone}/>
                <Zone id="calf-l" selected={zoneId} d="M80 422 L110 422 L104 500 L80 500 Z" onSelect={selectZone}/>
                <Zone id="calf-r" selected={zoneId} d="M150 422 L180 422 L180 500 L156 500 Z" onSelect={selectZone}/>
              </> : <>
                <Zone id="upper-back" selected={zoneId} d="M88 122 Q130 104 172 122 L166 182 L94 182 Z" onSelect={selectZone}/>
                <Zone id="lower-back" selected={zoneId} d="M99 184 L161 184 L158 245 Q130 258 102 245 Z" onSelect={selectZone}/>
                <Zone id="glute-r" selected={zoneId} d="M134 246 Q162 245 176 273 L165 315 L137 298 Z" onSelect={selectZone}/>
                <Zone id="ham-l" selected={zoneId} d="M80 306 L117 300 L112 390 L85 390 Z" onSelect={selectZone}/>
                <Zone id="ham-r" selected={zoneId} d="M143 300 L180 306 L175 390 L148 390 Z" onSelect={selectZone}/>
                <Zone id="achilles-r" selected={zoneId} d="M158 458 L177 458 L180 522 L162 522 Z" onSelect={selectZone}/>
              </>}
            </svg>
          </div>

          <div className="selected-zone"><span>Zona seleccionada</span><strong>{selected.label}</strong><small>{selected.hint}</small></div>
        </article>

        <article className="bodymap-panel insight-panel">
          <span className="bodymap-kicker">DETALLE DE LA MOLESTIA</span>
          <h2>{selected.label}</h2>
          <p className="muscle-hint">{selected.hint}</p>
          <div className={`pain-pill p${Math.min(9, intensity)}`}>Intensidad {intensity}/10</div>

          <div className="insight-block">
            <span>POSIBLES RELACIONES</span>
            <ul><li>Volumen o intensidad reciente de carrera</li><li>Fuerza, pádel o trabajo complementario</li><li>Sueño y recuperación de las últimas 48 h</li></ul>
          </div>
          <div className="recommendation-card">
            <span>RECOMENDACIÓN PEPPE</span>
            <strong>{intensity >= 7 ? 'Reduce carga y evita intensidad.' : intensity >= 4 ? 'Modifica la sesión y protege la zona.' : 'Entrena, pero monitoriza evolución.'}</strong>
            <p>La recomendación final debe cruzarse con tu sesión planificada, HRV, sueño, carga y evolución de esta molestia.</p>
          </div>
          <Link href="/decision" className="bodymap-cta">Ver decisión de entrenamiento</Link>
        </article>
      </section>

      <section className="bodymap-lower-grid">
        <article className="bodymap-panel"><span className="bodymap-kicker">EJERCICIOS</span><h2>Trabajo sugerido</h2><div className="exercise-list"><div><b>01</b><span>Movilidad específica<small>2–4 min · sin dolor creciente</small></span></div><div><b>02</b><span>Activación controlada<small>2–3 series · baja carga</small></span></div><div><b>03</b><span>Isométricos / estabilidad<small>Según zona seleccionada</small></span></div></div></article>
        <article className="bodymap-panel"><span className="bodymap-kicker">PATRÓN DETECTADO</span><h2>Molestia × entrenamiento</h2><div className="mini-bars">{[42,74,61,69,48,35,24].map((h, i) => <i key={i} style={{height:`${h}%`}} />)}</div><p className="bodymap-copy">Peppe podrá mostrar si la molestia coincide con aumentos de carga, dobles sesiones, poco sueño o cambios de superficie.</p></article>
        <article className="bodymap-panel"><span className="bodymap-kicker">SEGUIMIENTO</span><h2>Evolución</h2><div className="evolution-line"><i/><i/><i/><i/><i/></div><div className="today-score"><span>Hoy</span><strong>{intensity}/10</strong></div><p className="bodymap-copy">Mantendremos la escala diaria y la ubicación anatómica para detectar recurrencia y tendencia.</p></article>
      </section>
    </main>
  );
}

function Metric({ label, icon, value, onChange, danger = false }: { label: string; icon: string; value: number; onChange: (v: number) => void; danger?: boolean }) {
  return <label className="body-metric"><div><span className="metric-icon">{icon}</span><b>{label}</b><strong className={danger ? 'danger' : ''}>{value}</strong></div><input type="range" min="1" max="10" value={value} onChange={(e) => onChange(Number(e.target.value))}/><small><span>1</span><span>5</span><span>10</span></small></label>;
}

function Zone({ id, d, selected, onSelect }: { id: string; d: string; selected: string; onSelect: (id: string) => void }) {
  return <path className={`muscle-zone ${selected === id ? 'selected' : ''}`} d={d} onClick={() => onSelect(id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(id); }} />;
}
