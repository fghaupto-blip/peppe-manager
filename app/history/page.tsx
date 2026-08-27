import Link from 'next/link';
import styles from './history.module.css';

const sections = [
  {
    title: 'Composición corporal', cadence: 'Semanal / 8–12 semanas',
    description: 'Separar tendencia diaria de checkpoints comparables de composición corporal.',
    items: [['Diario', 'Peso + media móvil 7d'], ['Semanal', 'Cintura + contexto de hidratación'], ['Checkpoint', 'Grasa %, masa grasa, masa magra, agua, dispositivo y condiciones']],
  },
  {
    title: 'Perfil bioquímico', cadence: '3–6 meses',
    description: 'Resultados de laboratorio como capa longitudinal, nunca como dato aislado.',
    items: [['Sangre', 'Hemograma + Hb/Hto/VCM'], ['Hierro', 'Ferritina + transferrina/saturación'], ['Metabólico', 'Glucosa ayuno + HbA1c'], ['Contexto', 'Renal, hepático, TSH, B12/folato/Vit D según indicación']],
  },
  {
    title: 'Benchmarks fisiológicos', cadence: 'Mensual / por bloque',
    description: 'Puntos de referencia que permitan saber si el rendimiento mejora al mismo costo fisiológico.',
    items: [['Aeróbico', 'VO₂max, FC reposo, HRV'], ['Rendimiento', 'Ritmo/potencia a FC comparable'], ['Economía', 'Cadencia, GCT, zancada, deriva FC/ritmo']],
  },
  {
    title: 'Ambiente + adaptación', cadence: 'Automático por sesión',
    description: 'Aprender cómo cambia la respuesta del atleta según clima y condiciones externas.',
    items: [['Clima', 'Temperatura, humedad, punto de rocío, viento, UV, AQI'], ['Respuesta', 'FC, ritmo, potencia, RPE, glucosa'], ['Resultado', 'Perfil térmico + sugerencia de ropa, agua y sodio']],
  },
  {
    title: 'Hidratación + sudor', cadence: '1–2 veces/semana al inicio',
    description: 'Construir tasa de sudor personal sin hardware adicional.',
    items: [['Entrada', 'Peso pre/post + líquido + duración'], ['Contexto', 'Temperatura/humedad + intensidad'], ['Aprendizaje', 'L/h esperado por condición']],
  },
  {
    title: 'Fuel + tolerancia GI', cadence: 'Largos / sesiones clave',
    description: 'Relacionar disponibilidad de carbohidratos con rendimiento y tolerancia digestiva.',
    items: [['Fuel', 'CHO 24–48 h + CHO/h'], ['GI', 'Náuseas, hinchazón, reflujo, urgencia'], ['Salida', 'Estrategia personal de carrera con nivel de confianza']],
  },
];

export default function HistoryPage() {
  return (
    <main className={styles.shell}>
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · HISTORIAL LONGITUDINAL</span>
          <h1>Lo que cambia lento vive aquí.</h1>
          <p className="muted">Separado del minuto a minuto: checkpoints clínicos, fisiológicos y de composición para comparar meses, bloques y temporadas.</p>
        </div>
        <Link className="ghost link-button" href="/intelligence">Intelligence</Link>
      </header>

      <section className={styles.intro}>
        <article className={`card ${styles.principle}`}><span className="eyebrow light">REGLA DE PRODUCTO</span><h2>No pedir todos los días lo que cambia cada 3 meses.</h2><p>Peppe captura automáticamente lo frecuente y reserva este historial para mediciones de baja frecuencia. Cada registro conserva fecha, fuente/dispositivo, condiciones y comparables previos.</p></article>
        <article className="card"><span className="eyebrow">LECTURA LONGITUDINAL</span><h2>Baseline → tendencia → intervención → resultado</h2><p>El Decision Engine usa estos datos como contexto; no genera decisiones clínicas autónomas.</p><div className={styles.actions}><Link className={styles.link} href="/study">Abrir peso + glucosa</Link><Link className={styles.link} href="/body">Abrir cuerpo</Link></div></article>
      </section>

      <section className={styles.grid}>
        {sections.map((section) => <article className={`card ${styles.card}`} key={section.title}>
          <div className={styles.head}><span className="eyebrow">HISTORIAL</span><span className={styles.cadence}>{section.cadence}</span></div>
          <h2>{section.title}</h2><p>{section.description}</p>
          <div className={styles.items}>{section.items.map(([label,value]) => <div className={styles.item} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        </article>)}
      </section>

      <section className={`card ${styles.timeline}`}>
        <span className="eyebrow">TIMELINE DE CHECKPOINTS</span><h2>Una vista para comparar ciclos completos.</h2>
        <div className={styles.timelineRow}><span>BASELINE</span><div className={styles.timelineLine}/><strong>Inicio de bloque</strong></div>
        <div className={styles.timelineRow}><span>CHECKPOINT</span><div className={styles.timelineLine}/><strong>8–12 semanas</strong></div>
        <div className={styles.timelineRow}><span>RACE / TEST</span><div className={styles.timelineLine}/><strong>Resultado objetivo</strong></div>
      </section>

      <section className={`card ${styles.note}`}><span className="eyebrow">PRÓXIMA CAPA DE DATOS</span><h2>Persistencia estructurada en Supabase.</h2><p>La siguiente implementación debe crear tablas para body composition checkpoints, lab panels/results, sweat tests, environment responses y interventions/outcomes, con historial inmutable y comparación automática.</p></section>
    </main>
  );
}
