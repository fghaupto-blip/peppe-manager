import Link from 'next/link';
import styles from './intelligence.module.css';

const modules = [
  ['Readiness', 'Diario', 'Sueño, HRV, FC reposo, energía, hambre, estrés, dolor y carga previa.', 'Activo'],
  ['Fuel Availability', 'Diario', 'Disponibilidad estimada de combustible usando CHO, carga, glucosa y sesión futura.', 'Modelo'],
  ['Hydration + Sweat', 'Diario', 'Peso pre/post, líquido, duración, clima y tasa de sudor personal.', 'Modelo'],
  ['Environment', 'Por sesión', 'Temperatura, humedad, punto de rocío, viento, lluvia, UV, AQI y vestimenta.', 'Modelo'],
  ['Performance Response', 'Por sesión', 'Ritmo, FC, potencia, TSS, RPE, mecánica y respuesta al clima.', 'Historial'],
  ['Pain Map', 'Diario', 'Molestia localizada, severidad, tendencia y efecto sobre la técnica.', 'Registro'],
  ['Labs', '3–6 meses', 'Hemograma, hierro/ferritina, metabólico, renal, hepático y otros marcadores indicados.', 'Historial'],
  ['Body Trend', 'Semanal / trimestral', 'Peso 7d, cintura y checkpoints de composición corporal sin reaccionar a ruido diario.', 'Historial'],
  ['GI + Fuel Tolerance', 'Largos', 'CHO/h, agua/h, sodio, cafeína y tolerancia gastrointestinal.', 'Aprendizaje'],
];

export default function IntelligencePage() {
  return (
    <main className={styles.shell}>
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · PERFORMANCE INTELLIGENCE</span>
          <h1>Del dato a la decisión.</h1>
          <p className="muted">Una capa longitudinal para aprender cómo responde el atleta y apoyar el plan definido por su entrenador.</p>
        </div>
        <Link className="ghost link-button" href="/">Hoy</Link>
      </header>

      <section className={`card ${styles.hero}`}>
        <div><span className="eyebrow light">DECISION ENGINE</span><h2>Contexto → decisión → intervención → resultado → aprendizaje</h2></div>
        <div>
          <p>Peppe combina entrenamiento planificado, recuperación, combustible, hidratación, ambiente, salud y respuesta histórica. Las estimaciones muestran confianza y un “¿Por qué?”.</p>
          <div className={styles.links}><Link className={styles.link} href="/history">Abrir historial longitudinal</Link><Link className={styles.link} href="/study">Peso + glucosa</Link></div>
        </div>
      </section>

      <section className={styles.grid}>
        {modules.map(([name, cadence, description, status]) => (
          <article className={`card ${styles.card}`} key={name}>
            <div className={styles.head}><span className="eyebrow">{cadence}</span><span className={styles.pill}>{status}</span></div>
            <h2>{name}</h2><p>{description}</p>
            <div className={styles.confidence}><span>Confianza</span><strong>Se aprende con historial</strong></div>
          </article>
        ))}
      </section>

      <section className={`card ${styles.timeline}`}>
        <span className="eyebrow">TIMELINE FISIOLÓGICO</span><h2>Comparar periodos, no datos aislados.</h2>
        <p>Capas futuras: peso, cintura, sueño, HRV, FC reposo, VO₂max, carga/TSS, glucosa, Fuel Availability, sudor, clima, ferritina/hemoglobina y rendimiento.</p>
        <div className={styles.timelineDemo}><span>BASELINE</span><i/><span>BUILD</span><i/><span>PEAK</span><i/><span>OBJETIVO</span></div>
      </section>

      <section className={`card ${styles.safety}`}>
        <span className="eyebrow">GOBERNANZA CLÍNICA</span><h2>Interpretar no es diagnosticar.</h2>
        <p>Los laboratorios y señales fisiológicas se usan para tendencias y contexto deportivo. Peppe no prescribe tratamientos ni suplementos por alteraciones clínicas: deriva a médico/nutricionista cuando corresponde.</p>
      </section>
    </main>
  );
}
