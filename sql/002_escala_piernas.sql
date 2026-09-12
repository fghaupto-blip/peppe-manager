-- ============================================================================
-- PEPPE · 002 · CORTE DE ESCALA EN subjective_checkins
-- ============================================================================
-- Qué arregla: la columna `legs` recibió dos escalas opuestas.
--
--   web    1 = "Muy pesadas"  →  10 = "Muy frescas"
--   móvil  1 = "frescas"      →  10 = "muy cargadas"
--
-- Estrategia: aditiva y reversible. NO toca ni borra `legs`. Agrega una
-- columna nueva en escala canónica y marca la procedencia de cada fila.
-- Si algo sale mal, se revierte borrando las dos columnas nuevas.
--
-- Correr DESPUÉS de 001_auditoria.sql y de mirar el resultado del punto 5.
-- ============================================================================

begin;

-- 1. Columnas nuevas.
alter table subjective_checkins
  add column if not exists legs_load    smallint,
  add column if not exists scale_version text;

comment on column subjective_checkins.legs_load is
  'Carga de piernas en escala canónica: 1 = frescas, 10 = muy cargadas. Reemplaza a legs.';
comment on column subjective_checkins.scale_version is
  'v1 = escala canónica garantizada. unknown = histórico ambiguo, el motor lo ignora.';

alter table subjective_checkins
  add constraint subjective_checkins_legs_load_rango
  check (legs_load is null or legs_load between 1 and 10) not valid;

-- 2. Backfill de lo que SÍ es atribuible.

-- 2a. Móvil: ya estaba en escala canónica, se copia tal cual.
update subjective_checkins
   set legs_load = legs, scale_version = 'v1'
 where legs is not null
   and notes like 'adaptive_%'
   and legs_load is null;

-- 2b. Web enhancer: escala invertida, se voltea (1<->10, 4<->7).
update subjective_checkins
   set legs_load = 11 - legs, scale_version = 'v1'
 where legs is not null
   and notes = 'Peppe · segunda pantalla · señales humanas'
   and legs_load is null;

-- 2c. Lectura rápida desde inicio: app/page.tsx:306 escribía `legs: feeling`,
--     copiando la respuesta de energía. Ese dato no es una medición de
--     piernas, es energía duplicada. No se convierte: se descarta.
update subjective_checkins
   set legs_load = null, scale_version = 'unknown'
 where notes = 'Lectura rápida desde inicio'
   and scale_version is null;

-- 2d. Todo lo demás (notes null, pantallas /moment que son idénticas en web y
--     móvil): el origen no es recuperable. Adivinar el flip sería inventar
--     datos sobre el cuerpo de un atleta. Se marca y el motor lo ignora.
update subjective_checkins
   set scale_version = 'unknown'
 where scale_version is null;

-- 3. Desde ahora, toda escritura nueva declara su escala.
alter table subjective_checkins
  alter column scale_version set default 'v1';

-- 4. Verificación antes de confirmar. Revisa el resultado; si no cuadra, rollback.
select scale_version,
       count(*)              as filas,
       count(legs_load)      as con_legs_load,
       min(checked_at)::date as desde,
       max(checked_at)::date as hasta
from subjective_checkins
group by 1;

commit;

-- ============================================================================
-- REVERSIÓN
-- ============================================================================
-- alter table subjective_checkins
--   drop constraint if exists subjective_checkins_legs_load_rango,
--   drop column if exists legs_load,
--   drop column if exists scale_version;
-- ============================================================================

-- ============================================================================
-- DESPUÉS DE ESTO, EN EL CÓDIGO
-- ============================================================================
-- 1. Toda UI que pregunte piernas usa las etiquetas de scales.ts:
--      1 = "Frescas"   10 = "Muy cargadas"
-- 2. Todo insert pasa por toCheckinRow(), que escribe legs, legs_load y
--    scale_version juntos.
-- 3. Toda lectura pasa por normalizeCheckin(), que descarta 'unknown'.
-- 4. app/page.tsx deja de escribir `legs: feeling`. Si sólo preguntas una
--    cosa, guarda esa cosa; no la copies a otra columna.
-- 5. Cuando no queden lecturas de `legs` en el código, se puede borrar.
-- ============================================================================
