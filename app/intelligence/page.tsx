import Link from 'next/link';

const modules = [
  ['Readiness', 'Diario', 'Sueño, HRV, FC reposo, energía, hambre, estrés, dolor y carga previa.', 'Activo'],
  ['Fuel Availability', 'Diario', 'Disponibilidad estimada de combustible usando CHO, carga, glucosa y sesión futura.', 'Modelo'],
  ['Hydration + Sweat', 'Diario', 'Peso pre/post, líquido, duración, clima y tasa de sudor personal.', 'Modelo'],
  ['Environment', 'Por sesión', 'Temperatura, humedad, punto de rocío, viento, lluvia, UV, AQI y vestimenta.', 'Modelo'],
  ['Performance Response', 'Por sesión', 'Ritmo, FC, potencia, TSS, RPE, mecánica y respuesta al clima.', 'Historial'],
  ['Pain Map', 'Diario', 'Molestia localizada, severidad, tendencia y efecto sobre la técnica.', 'Registro'],
  ['Labs', '3–6 meses', 'Hemograma, hierro/ferritina, metabólico, renal, hepático y otros marcadores indicados.', 'Historial'],
  ['Body Trend', 'Semanal', 'Peso 7d, cintura y composición corporal sin reaccionar a ruido diario.', 'Historial'],
  ['GI + Fuel Tolerance', 'Largos', 'CHO/h, agua/h, sodio, cafeína y tolerancia gastrointestinal.', 'Aprendizaje'],
];

export default function IntelligencePage() {
  return (
    <main className="shell intelligence-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · PERFORMANCE INTELLIGENCE</span>
          <h1>Del dato a la decisión.</h1>
          <p className="muted">Una capa longitudinal para aprender cómo responde el atleta y apoyar el plan definido por su entrenador.</p>
        </div>
        <Link className="ghost link-button" href="/">Hoy</Link>
      </header>

      <section className="decision-hero card">
        <div><span className="eyebrow">DECISION ENGINE</span><h2>Contexto → decisión → intervención → resultado → aprendizaje</h2></div>
        <p>Peppe combina entrenamiento planificado, recuperación, combustible, hidratación, ambiente, salud y respuesta histórica. Las estimaciones deben mostrar confianza y un “¿Por qué?”.</p>
      </section>

      <section className="intelligence-grid">
        {modules.map(([name, cadence, description, status]) => (
          <article className="card intelligence-card" key={name}>
            <div className="intelligence-card-head"><span className="eyebrow">{cadence}</span><span className="status-pill">{status}</span></div>
            <h2>{name}</h2><p>{description}</p>
            <div className="confidence"><span>Confianza</span><strong>Se aprende con historial</strong></div>
          </article>
        ))}
      </section>

      <section className="card timeline-card">
        <span className="eyebrow">TIMELINE FISIOLÓGICO</span><h2>Comparar periodos, no datos aislados.</h2>
        <p>Capas futuras: peso, cintura, sueño, HRV, FC reposo, VO₂max, carga/TSS, glucosa, Fuel Availability, sudor, clima, ferritina/hemoglobina y rendimiento.</p>
        <div className="timeline-demo"><span>MAR</span><i/><span>JUN</span><i/><span>AGO</span><i/><span>OBJETIVO</span></div>
      </section>

      <section className="card safety-card">
        <span className="eyebrow">GOBERNANZA CLÍNICA</span><h2>Interpretar no es diagnosticar.</h2>
        <p>Los laboratorios y señales fisiológicas se usan para tendencias y contexto deportivo. Peppe no prescribe tratamientos ni suplementos por alteraciones clínicas: deriva a médico/nutricionista cuando corresponde.</p>
      </section>
    </main>
  );
}
