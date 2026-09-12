-- ============================================================================
-- PEPPE · 001 · AUDITORÍA (SOLO LECTURA)
-- ============================================================================
-- Correr en Supabase → SQL Editor. No modifica nada.
-- Devuelve el estado real del esquema para poder consolidar sin adivinar.
--
-- El código usa 31 tablas distintas y ninguna migración está versionada en el
-- repo, así que hoy el esquema sólo existe dentro de Supabase. Esto lo saca a
-- la luz antes de tocar nada.
-- ============================================================================

-- 1. Qué tablas existen, cuántas filas tienen y si tienen RLS activa.
--    Cualquier tabla con rls_habilitada = false es lectura abierta para
--    quien tenga la publishable key, que está en el bundle del navegador.
select
  c.relname                                   as tabla,
  c.reltuples::bigint                         as filas_estimadas,
  c.relrowsecurity                            as rls_habilitada,
  c.relforcerowsecurity                       as rls_forzada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- 2. Las policies en detalle: qué permite cada una y para quién.
select tablename as tabla, policyname as politica, cmd as operacion,
       roles, qual as condicion_lectura, with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- 3. Columnas de los pares sospechosos de duplicación.
--    El móvil escribe en la primera de cada par; la web en la segunda.
select table_name as tabla, ordinal_position as pos, column_name as columna,
       data_type as tipo, is_nullable as acepta_null, column_default as por_defecto
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'activities',            'training_sessions',
    'integrations',          'integration_accounts',
    'profiles',              'athlete_profiles',
    'context_snapshots',     'moment_snapshots',      'decision_snapshots'
  )
order by table_name, ordinal_position;

-- 4. Volumen real y ventana temporal de cada tabla del par duplicado.
--    Decide cuál sobrevive: la que tiene datos, no la que tiene mejor nombre.
select 'activities' as tabla, count(*) as filas,
       min(started_at)::date as desde, max(started_at)::date as hasta
from activities
union all
select 'training_sessions', count(*), min(started_at)::date, max(started_at)::date
from training_sessions
union all
select 'integrations', count(*), null, null from integrations
union all
select 'integration_accounts', count(*), null, null from integration_accounts
union all
select 'profiles', count(*), null, null from profiles
union all
select 'athlete_profiles', count(*), null, null from athlete_profiles;

-- 5. EL DATO CLAVE: cuánto del histórico de piernas es recuperable.
--    El móvil deja huella en `notes` ('adaptive_...'), la web deja otras cosas
--    o null. Todo lo que caiga en 'origen_desconocido' no se puede
--    des-invertir sin inventar datos.
select
  case
    when notes like 'adaptive_%'                     then 'movil (escala: alto = cargado)'
    when notes = 'Peppe · segunda pantalla · señales humanas'
                                                     then 'web enhancer (escala: alto = fresco)'
    when notes = 'Lectura rápida desde inicio'       then 'web inicio (legs copiado de energia: INVALIDO)'
    when notes is null or notes = ''                 then 'origen_desconocido'
    else 'web otros (escala: alto = fresco)'
  end                         as origen,
  count(*)                    as filas,
  count(legs)                 as con_valor_legs,
  min(checked_at)::date       as desde,
  max(checked_at)::date       as hasta
from subjective_checkins
group by 1
order by filas desc;

-- 6. Sesiones que quedaron sólo en una de las dos tablas.
--    Estas son las que "desaparecen" al cambiar de app.
select date_trunc('day', a.started_at)::date as dia, count(*) as solo_en_activities
from activities a
where not exists (
  select 1 from training_sessions t
  where t.athlete_id = a.athlete_id
    and abs(extract(epoch from (t.started_at - a.started_at))) < 180
)
group by 1
order by 1 desc
limit 30;
