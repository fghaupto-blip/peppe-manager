# Consolidación del esquema

Estado actual: 31 tablas en uso, ninguna migración versionada en el repo, y la
web y el móvil escribiendo en tablas distintas para las mismas cosas.

## Los pares duplicados

Cada fila es la misma entidad guardada en dos lugares. La columna "sobrevive"
es una propuesta, no una decisión: se confirma con el punto 4 de
`sql/001_auditoria.sql`, que dice cuál tiene datos reales.

| Entidad | Web usa | Móvil usa | Propuesta | Por qué |
|---|---|---|---|---|
| Sesión ejecutada | `training_sessions` | `activities` | `training_sessions` | Tiene más columnas de proveedor (tss, training_load, intensity_factor) y la lógica de merge multi-fuente ya está escrita contra ella |
| Cuenta conectada | `integration_accounts` | `integrations` | `integration_accounts` | Guarda `last_synced_at`, que el resto del código necesita |
| Perfil | `profiles` + `athlete_profiles` | `athlete_profiles` | `athlete_profiles` | La web usa las dos a la vez; `profiles` sólo aporta `full_name` y `role`, que caben en la otra |
| Snapshot de decisión | `decision_snapshots` | `moment_snapshots` | `decision_snapshots` | Es la que consultan backoffice e historial |
| Contexto ambiental | (no usa) | `context_snapshots` | `context_snapshots` | No hay conflicto, sólo falta que la web la lea |

Pérdida concreta hoy: `activities` tiene una columna `rpe` que
`training_sessions` no tiene. El esfuerzo percibido que el atleta responde en
el celular no existe para la web. Al consolidar hay que llevarse esa columna.

## Orden de trabajo

1. **Auditar** (`sql/001_auditoria.sql`). Sin esto todo lo demás es adivinar.
   Lo primero que hay que mirar no es la duplicación sino la columna
   `rls_habilitada`: cualquier tabla en `false` es lectura abierta para quien
   tenga la publishable key, y esa key está en el bundle público.
2. **Cortar el sangrado de escalas** (`sql/002_escala_piernas.sql`). Es
   aditivo y reversible, se puede correr hoy sin esperar al resto.
3. **Unificar el motor**: web y móvil llaman a `decide()` de `peppe-core`.
   Se borran `lib/peppe-engine.ts`, `buildGuidance()` de
   `app/peppe-enhancer-v2.tsx` y `mobile/lib/intelligence.ts`.
4. **Consolidar tablas**, una por una, en orden de riesgo creciente:
   `integrations` → `integration_accounts` (pocas filas),
   `profiles` → `athlete_profiles`,
   `activities` → `training_sessions` (la más delicada, hay que fusionar
   sesiones duplicadas por timestamp y traerse `rpe`).
5. **Versionar el esquema**: `supabase/migrations/` en el repo, generado con
   `supabase db pull`. Desde ahí, ningún cambio de esquema fuera de migración.

## Regla que evita repetir esto

Una entidad, una tabla, un nombre. Si el móvil necesita un campo nuevo, se
agrega a la tabla existente; no se crea una paralela. El adaptador de cada
cliente traduce de la tabla al tipo canónico de `peppe-core`, y esa es la
única capa que conoce nombres de columnas.
