import type { Checkin, ScaleVersion } from './types.ts';

/**
 * EL BUG QUE ESTE ARCHIVO EXISTE PARA MATAR
 * ------------------------------------------
 * `subjective_checkins.legs` recibió dos escalas opuestas durante meses:
 *
 *   web    (lib/peppe-engine.ts)        1 = "Muy pesadas"  10 = "Muy frescas"
 *   móvil  (mobile/lib/questionEngine)  1 = "frescas"      10 = "muy cargadas"
 *
 * Y cada motor interpretaba a su manera:
 *   web    weak  si legs <= 4
 *   móvil  weak  si legs >= 8
 *
 * Resultado: un 9 del celular significa piernas destruidas y un 9 de la web
 * significa piernas perfectas, en la misma columna de la misma tabla.
 *
 * La convención canónica elegida es la del móvil (`legsLoad`: alto = cargado),
 * porque deja TODAS las señales de costo apuntando en la misma dirección
 * (soreness, stress, hunger ya funcionan así).
 *
 * Sobre el histórico: NO se puede des-mezclar de forma confiable. Varias
 * pantallas (app/moment/page.tsx y mobile/app/moment.tsx, casi idénticas)
 * escriben con `notes` nulo, así que el origen no es recuperable fila por
 * fila. Adivinar el flip inventaría datos. La decisión es marcar todo lo
 * anterior al corte como `scaleVersion: 'unknown'` y que el motor lo descarte
 * en vez de interpretarlo mal.
 */

export type RawCheckinRow = {
  energy: number | null;
  hunger: number | null;
  legs: number | null;
  /** Columna nueva. Si viene poblada, ya está en escala canónica. */
  legs_load?: number | null;
  soreness: number | null;
  stress: number | null;
  pain: boolean | null;
  notes: string | null;
  checked_at: string;
  scale_version?: string | null;
};

function clampScale(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(10, Math.round(value)));
}

/** Invierte una escala 1..10 conservando los extremos: 1<->10, 4<->7. */
export function invertScale(value: number | null): number | null {
  const v = clampScale(value);
  return v == null ? null : 11 - v;
}

/**
 * Convierte una fila cruda de `subjective_checkins` al tipo canónico.
 * Nunca adivina: si no puede garantizar la escala, marca 'unknown' y deja
 * legsLoad en null para que ninguna regla lo use.
 */
export function normalizeCheckin(row: RawCheckinRow | null): Checkin | null {
  if (!row) return null;

  const declared = row.scale_version;
  let legsLoad: number | null = null;
  let scaleVersion: ScaleVersion = 'unknown';

  if (row.legs_load != null) {
    // Columna nueva: ya canónica por definición.
    legsLoad = clampScale(row.legs_load);
    scaleVersion = 'v1';
  } else if (declared === 'v1') {
    legsLoad = clampScale(row.legs);
    scaleVersion = 'v1';
  } else {
    // Fila histórica sin procedencia verificable: se descarta la señal.
    legsLoad = null;
    scaleVersion = 'unknown';
  }

  return {
    energy: clampScale(row.energy),
    hunger: clampScale(row.hunger),
    legsLoad,
    soreness: clampScale(row.soreness),
    stress: clampScale(row.stress),
    pain: row.pain,
    notes: row.notes,
    checkedAt: new Date(row.checked_at),
    scaleVersion,
  };
}

/**
 * Prepara una respuesta de UI para escribir en la base.
 * `legsLoad` debe venir ya en escala canónica desde el formulario.
 */
export function toCheckinRow(input: {
  athleteId: string;
  energy: number | null;
  hunger: number | null;
  legsLoad: number | null;
  soreness: number | null;
  stress: number | null;
  pain: boolean | null;
  notes: string | null;
}) {
  return {
    athlete_id: input.athleteId,
    energy: clampScale(input.energy),
    hunger: clampScale(input.hunger),
    legs: clampScale(input.legsLoad),
    legs_load: clampScale(input.legsLoad),
    soreness: clampScale(input.soreness),
    stress: clampScale(input.stress),
    pain: input.pain,
    notes: input.notes,
    scale_version: 'v1' as const,
  };
}

/** Etiquetas oficiales. Cualquier UI que pregunte piernas debe usar estas. */
export const LEGS_LABELS = { low: 'Frescas', high: 'Muy cargadas' } as const;
export const ENERGY_LABELS = { low: 'Sin energía', high: 'Excelente' } as const;
export const HUNGER_LABELS = { low: 'Nada', high: 'Muchísima' } as const;
export const SORENESS_LABELS = { low: 'Nada', high: 'Muy alta' } as const;
