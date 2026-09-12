# @peppe/core

El criterio de Peppe, en un solo lugar.

Reemplaza a los tres motores que convivían en el repo y que daban respuestas
distintas para los mismos datos:

- `lib/peppe-engine.ts` → `buildPeppeDecision()`
- `app/peppe-enhancer-v2.tsx` → `buildGuidance()`
- `mobile/lib/intelligence.ts` → `buildPeppeSnapshot()`

## Cómo se usa

```ts
import { decide, normalizeCheckin } from '@peppe/core';

const decision = decide({
  now: new Date(),
  goal, prefs, storedScores,
  checkin: normalizeCheckin(rawRow),
  nutrition, lastActivity, nextPlanned, dailyMetric, glucose,
  integrations, readinessHistory, evidenceCount,
});
```

`decide()` es una función pura. No toca la red ni Supabase. Cada cliente arma
el `PeppeInput` con su propio adaptador y el motor responde lo mismo en web y
en móvil, siempre.

```
npm test        # 22 tests
npm run typecheck
```

## Lo que cambió respecto del código anterior

**Una sola escala.** `subjective_checkins.legs` recibía dos escalas opuestas
según desde dónde respondieras. La canónica ahora es `legsLoad`: 1 = frescas,
10 = muy cargadas, igual que el resto de las señales de costo. Ver
`src/scales.ts` y `sql/002_escala_piernas.sql`.

**Los umbrales son visibles.** Todos los números viven en `src/thresholds.ts`
con su procedencia marcada: `heredado`, `consenso` o `arbitrario`. Los
`arbitrario` son deuda declarada, pendientes de calibrar contra datos reales.
Se pueden sobrescribir pasando un segundo argumento a `decide()`, lo que
permite probar calibraciones sin tocar la lógica.

**Toda decisión explica por qué.** El campo `why` trae cada regla que disparó
y con qué valor. Sirve para depurar, para mostrarle al atleta el razonamiento
y para auditar el motor contra el criterio de un entrenador real.

**La hora es la del atleta.** Los tres motores anteriores usaban
`now.getHours()`, o sea la hora del dispositivo o del servidor. Funcionaba de
casualidad porque todo corría en el navegador de alguien en Chile. Ahora se lee
`user_preferences.timezone`, que existía desde el principio sin que nadie la
usara.

**Guardarraíles explícitos.** `pain_lock` bloquea cualquier sugerencia de
carga cuando hay dolor. `coach_owns_plan` está siempre: Peppe ajusta
alimentación, hidratación y recuperación, nunca la sesión del entrenador.
`stale_scale` marca cuando un check-in viene de la escala vieja y sus datos de
piernas se descartan en vez de interpretarse mal.

## Estructura

```
src/types.ts        tipos canónicos y la convención de escalas
src/thresholds.ts   todos los números, con procedencia
src/scales.ts       normalización y arreglo del bug de piernas
src/moment.ts       qué momento del día es y por qué
src/scores.ts       readiness, fuel, recovery, load y confianza
src/questions.ts    catálogo único y selección adaptativa
src/decide.ts       la función principal
```

## Pendiente

Los adaptadores de Supabase (`loadPeppeInput`) se escriben cuando se confirme
qué tabla sobrevive de cada par duplicado. Ver `docs/consolidacion-esquema.md`.
