'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadPeppeInput } from '../../lib/peppe-adapter';
import {
  decide, allSignalStates, toCheckinRow,
  type PeppeDecision, type PeppeInput, type Question,
} from '../../packages/peppe-core/src/index.ts';

/**
 * PANTALLA /hoy
 *
 * Invierte el orden del producto anterior. La pantalla vieja abre pidiendo
 * datos: contesta seis preguntas y después, quizás, algo cambia. Esta abre
 * mostrando qué sabe Peppe y qué recomienda. La pregunta va abajo, marcada
 * como lo que es: algo que haría la lectura más precisa, no un peaje.
 *
 * Las tres reglas que la gobiernan:
 *   1. La recomendación se ve SIEMPRE, incluso sin haber contestado nada.
 *   2. Una pregunta a la vez, y solo las que el motor considera vencidas.
 *   3. Al responder, se muestra explícitamente qué cambió. Si no cambió
 *      nada visible, esa pregunta no debió existir.
 */

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e3dd', borderRadius: 14,
  padding: 20, marginBottom: 14,
};
const label: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: '#8a877e', marginBottom: 8,
};

type Delta = { antes: number | null; despues: number | null; titularAntes: string; titularDespues: string };

export default function HoyPage() {
  const [estado, setEstado] = useState('Cargando…');
  const [userId, setUserId] = useState<string | null>(null);
  const [input, setInput] = useState<PeppeInput | null>(null);
  const [d, setD] = useState<PeppeDecision | null>(null);
  const [valor, setValor] = useState(5);
  const [guardando, setGuardando] = useState(false);
  const [delta, setDelta] = useState<Delta | null>(null);

  const cargar = useCallback(async (id: string) => {
    const entrada = await loadPeppeInput(id);
    setInput(entrada);
    const decision = decide(entrada);
    setD(decision);
    return decision;
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setEstado('Necesitas iniciar sesión.'); return; }
      setUserId(data.user.id);
      try { await cargar(data.user.id); setEstado(''); }
      catch (e) { setEstado(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    })();
  }, [cargar]);

  async function responder(q: Question, respuesta: number | boolean) {
    if (!userId || !d) return;
    setGuardando(true);
    const antes = { readiness: d.scores.readiness, titular: d.recommendation.headline };

    // Se escribe SOLO la señal que se preguntó. Nada de rellenar las otras
    // columnas con valores por defecto: una columna vacía es información
    // honesta, un valor inventado no.
    const fila = toCheckinRow({
      athleteId: userId,
      energy: q.id === 'energy' ? Number(respuesta) : null,
      hunger: q.id === 'hunger' ? Number(respuesta) : null,
      legsLoad: q.id === 'legs' ? Number(respuesta) : null,
      soreness: q.id === 'soreness' ? Number(respuesta) : null,
      stress: null,
      pain: q.id === 'pain' ? Boolean(respuesta) : null,
      notes: `hoy:${q.id}`,
    });

    const { error } = await supabase.from('subjective_checkins').insert(fila);
    if (error) { setEstado(`No se pudo guardar: ${error.message}`); setGuardando(false); return; }

    const nueva = await cargar(userId);
    setDelta({
      antes: antes.readiness, despues: nueva.scores.readiness,
      titularAntes: antes.titular, titularDespues: nueva.recommendation.headline,
    });
    setValor(5);
    setGuardando(false);
  }

  if (estado) return <main style={{ padding: 32, fontFamily: 'system-ui' }}>{estado}</main>;
  if (!d || !input) return null;

  const pregunta = d.questions[0];
  const señales = allSignalStates(input);
  const vigentes = señales.filter((s) => s.fresh);

  return (
    <main style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'system-ui', color: '#22201c' }}>

      <div style={label}>{d.moment.label}</div>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 8px', lineHeight: 1.25 }}>
        {d.recommendation.headline}
      </h1>
      <p style={{ color: '#57544d', margin: '0 0 20px', lineHeight: 1.6 }}>{d.recommendation.body}</p>

      {/* El acuse de recibo. Aparece solo después de responder, y es lo
          primero que se ve: la respuesta se pagó al contado. */}
      {delta && (
        <div style={{ ...card, background: '#f2f7f4', borderColor: '#bcd9cb' }}>
          <div style={{ ...label, color: '#3d6b53' }}>Tu respuesta cambió esto</div>
          {delta.antes !== delta.despues && (
            <p style={{ margin: '0 0 6px', fontSize: 15 }}>
              Readiness: {delta.antes ?? '—'} → <strong>{delta.despues ?? '—'}</strong>
            </p>
          )}
          {delta.titularAntes !== delta.titularDespues ? (
            <p style={{ margin: 0, fontSize: 15 }}>La recomendación pasó a: {delta.titularDespues}</p>
          ) : (
            <p style={{ margin: 0, fontSize: 15, color: '#57544d' }}>
              La recomendación se mantiene. Tu respuesta la confirmó.
            </p>
          )}
        </div>
      )}

      <div style={card}>
        <div style={label}>Qué haría hoy</div>
        <p style={{ margin: '0 0 10px' }}><strong>Entrenamiento.</strong> {d.recommendation.training}</p>
        <p style={{ margin: '0 0 10px' }}><strong>Alimentación.</strong> {d.recommendation.nutrition}</p>
        <p style={{ margin: 0 }}><strong>Recuperación.</strong> {d.recommendation.recovery}</p>
      </div>

      {pregunta ? (
        <div style={{ ...card, borderColor: '#d8d4c8' }}>
          <div style={label}>Esto haría la lectura más precisa</div>
          <p style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>{pregunta.label}</p>
          <p style={{ fontSize: 13, color: '#8a877e', margin: '0 0 16px' }}>{pregunta.why}</p>

          {pregunta.kind === 'scale' && (
            <>
              <input type="range" min={1} max={10} value={valor} disabled={guardando}
                onChange={(e) => setValor(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#22201c' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8a877e', marginBottom: 14 }}>
                <span>{pregunta.lowLabel}</span><strong style={{ color: '#22201c', fontSize: 15 }}>{valor}</strong><span>{pregunta.highLabel}</span>
              </div>
              <button onClick={() => responder(pregunta, valor)} disabled={guardando}
                style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#22201c', color: '#fff', fontSize: 15, cursor: 'pointer' }}>
                {guardando ? 'Guardando…' : 'Responder'}
              </button>
            </>
          )}

          {pregunta.kind === 'choice' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {pregunta.options?.map((o) => (
                <button key={o.value} disabled={guardando}
                  onClick={() => responder(pregunta, o.value === 'yes')}
                  style={{ flex: 1, padding: 13, borderRadius: 10, border: '1px solid #d8d4c8', background: '#fff', fontSize: 15, cursor: 'pointer' }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, background: '#faf9f6' }}>
          <div style={label}>Peppe en silencio</div>
          <p style={{ margin: 0, color: '#57544d' }}>
            No hace falta que respondas nada ahora. {d.nextMoment}.
          </p>
        </div>
      )}

      <details style={{ ...card, padding: '14px 20px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, color: '#57544d' }}>
          Qué sabe Peppe ahora mismo ({vigentes.length} de {señales.length} señales vigentes)
        </summary>
        <div style={{ marginTop: 14 }}>
          {señales.map((s) => (
            <div key={s.signal} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: '1px solid #f0eee8' }}>
              <span>{s.signal}</span>
              <span style={{ color: s.fresh ? '#3d6b53' : '#8a877e' }}>
                {s.fresh ? `vigente · hace ${Math.round(s.ageMinutes ?? 0)} min` : (s.expiredBecause ?? 'sin dato')}
              </span>
            </div>
          ))}
          {d.known.map((f, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: '#57544d' }}>
              <span>{f.label}</span><span>{f.value}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, fontSize: 12, color: '#8a877e', lineHeight: 1.6 }}>
            {d.why.map((r, i) => <div key={i}>{r.detail}</div>)}
          </div>
        </div>
      </details>
    </main>
  );
}
