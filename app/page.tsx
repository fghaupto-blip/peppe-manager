'use client';

import { useState } from 'react';

const scores = [
  { label: 'Readiness', value: 82, note: 'Buena disposición para entrenar' },
  { label: 'Fuel', value: 64, note: 'Conviene reforzar energía' },
  { label: 'Recovery', value: 78, note: 'Recuperación adecuada' },
  { label: 'Load', value: 71, note: 'Carga moderada-alta' },
];

export default function Home() {
  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <span className="eyebrow">PEPPE MANAGER · PILOTO</span>
          <h1>Tu copiloto de rendimiento diario.</h1>
          <p>Entrenamiento, recuperación, nutrición y sensaciones en una sola lectura.</p>
        </div>
        <div className="status">Piloto activo</div>
      </section>

      <section className="grid scores">
        {scores.map((score) => (
          <article className="card score" key={score.label}>
            <span>{score.label}</span>
            <strong>{score.value}</strong>
            <small>{score.note}</small>
          </article>
        ))}
      </section>

      <section className="grid content">
        <article className="card workout">
          <span className="eyebrow">ENTRENAMIENTO DE HOY</span>
          <h2>15 km progresivos</h2>
          <p>Objetivo: terminar fuerte manteniendo control de frecuencia cardíaca.</p>
          <div className="metrics"><span>07:00</span><span>Running</span><span>~70 min</span></div>
        </article>

        <article className="card recommendation">
          <span className="eyebrow">PRÓXIMA DECISIÓN</span>
          <h2>Recuperación post entrenamiento</h2>
          <p>Prioriza proteína, líquido y carbohidratos según la carga real de la sesión.</p>
          <button>Ver recomendación</button>
        </article>
      </section>

      <section className="card checkin">
        <span className="eyebrow">CHECK-IN · 20 SEGUNDOS</span>
        <h2>¿Cómo estás ahora?</h2>
        <label>
          Energía <strong>{energy}/10</strong>
          <input type="range" min="1" max="10" value={energy} onChange={(e) => setEnergy(Number(e.target.value))} />
        </label>
        <label>
          Hambre <strong>{hunger}/10</strong>
          <input type="range" min="1" max="10" value={hunger} onChange={(e) => setHunger(Number(e.target.value))} />
        </label>
        <button className="primary">Guardar check-in</button>
      </section>

      <footer>V0.1 · Los scores de esta pantalla son demostrativos hasta conectar los datos individuales.</footer>
    </main>
  );
}
