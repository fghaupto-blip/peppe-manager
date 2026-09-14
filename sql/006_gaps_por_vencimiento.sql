-- ============================================================================
-- PEPPE · 006 · HUECOS POR VENCIMIENTO DE SEÑAL
-- ============================================================================
-- Reemplaza a athlete_context_gaps de 003.
--
-- QUÉ CAMBIA
--   003  "¿hubo algún check-in hoy?"  → todo o nada
--   006  "¿qué señal está vencida?"   → cada una a su ritmo
--
-- Los plazos son los mismos que usa el motor (packages/peppe-core/src/
-- thresholds.ts, bloque `freshness`). Si cambias uno, cámbialo en los dos
-- lados o volverán a divergir, que es el problema que veníamos arreglando.
--
--   dolor      24 h
--   piernas    12 h   y se invalida si entrenó después
--   molestia   12 h   y se invalida si entrenó después
--   energía     6 h   y se invalida si entrenó después
--   hambre      3 h   y se invalida si comió después
--
-- Es SOLO LECTURA. Correrla no cambia nada.
-- ============================================================================

create or replace function public.athlete_context_gaps(
  p_athlete uuid,
  p_date    date default null
)
returns table (
  gap_key     text,
  priority    smallint,
  prompt_type text,
  detail      text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tz             text;
  v_today          date;
  v_now            timestamptz := now();
  v_local_hour     int;
  v_last_session   record;
  v_session_end    timestamptz;
  v_checkin        record;
  v_last_meal      timestamptz;
  v_comidas_hoy    int;
  v_metricas_hoy   int;
  v_tiene_objetivo boolean;
  v_edad_min       numeric;      -- antigüedad del check-in, en minutos
  v_energia_ok     boolean := false;
  v_piernas_ok     boolean := false;
  v_dolor_ok       boolean := false;
  v_hambre_ok      boolean := false;
begin
  select coalesce(timezone, 'America/Santiago') into v_tz
  from user_preferences where athlete_id = p_athlete;
  v_tz := coalesce(v_tz, 'America/Santiago');

  v_today := coalesce(p_date, (v_now at time zone v_tz)::date);
  v_local_hour := extract(hour from (v_now at time zone v_tz));

  -- Última sesión y cuándo terminó.
  select * into v_last_session
  from training_sessions
  where athlete_id = p_athlete and started_at >= v_now - interval '24 hours'
  order by started_at desc limit 1;

  if v_last_session.id is not null then
    v_session_end := v_last_session.started_at
      + make_interval(secs => coalesce(v_last_session.moving_seconds,
                                       v_last_session.duration_seconds, 0));
  end if;

  -- Último check-in, sea de hoy o de ayer: lo que importa es su antigüedad.
  select * into v_checkin
  from subjective_checkins
  where athlete_id = p_athlete
  order by checked_at desc limit 1;

  select max(eaten_at) into v_last_meal
  from nutrition_entries where athlete_id = p_athlete;

  select count(*) into v_comidas_hoy
  from nutrition_entries
  where athlete_id = p_athlete and (eaten_at at time zone v_tz)::date = v_today;

  select count(*) into v_metricas_hoy
  from daily_metrics where athlete_id = p_athlete and metric_date = v_today;

  select (primary_goal is not null and primary_goal <> '')
    into v_tiene_objetivo
  from athlete_profiles where user_id = p_athlete;

  -- ---- Vigencia de cada señal ------------------------------------------
  if v_checkin.id is not null then
    v_edad_min := extract(epoch from (v_now - v_checkin.checked_at)) / 60;

    v_dolor_ok := v_checkin.pain is not null and v_edad_min <= 1440;

    v_energia_ok := v_checkin.energy is not null
      and v_edad_min <= 360
      and (v_session_end is null or v_session_end <= v_checkin.checked_at);

    -- Piernas exige además que la fila declare su escala. Mientras
    -- 002_escala_piernas.sql no esté aplicado, ninguna fila la declara y la
    -- señal se considera vencida: preferimos preguntar de nuevo antes que
    -- interpretar un número cuya escala no conocemos.
    v_piernas_ok := v_checkin.legs_load is not null
      and coalesce(v_checkin.scale_version, 'unknown') = 'v1'
      and v_edad_min <= 720
      and (v_session_end is null or v_session_end <= v_checkin.checked_at);

    v_hambre_ok := v_checkin.hunger is not null
      and v_edad_min <= 180
      and (v_last_meal is null or v_last_meal <= v_checkin.checked_at);
  end if;

  -- ---- Huecos, de más a menos urgente ----------------------------------

  -- 1. Entrenó y las señales que el entrenamiento cambia están vencidas.
  if v_session_end is not null
     and v_session_end <= v_now
     and v_now - v_session_end <= interval '6 hours'
     and not (v_piernas_ok and v_dolor_ok)
  then
    return query select
      'post_training_sin_respuesta'::text, 1::smallint, 'post_training'::text,
      format('Sesión "%s" terminó hace %s min y las señales que cambia siguen sin releer.',
             coalesce(v_last_session.title, v_last_session.sport, 'entrenamiento'),
             round(extract(epoch from (v_now - v_session_end)) / 60));
  end if;

  -- 2. Ancla del día: ninguna señal estructural vigente, y ya es hora
  --    razonable para preguntar.
  if not v_energia_ok and not v_piernas_ok and v_local_hour >= 9 then
    return query select
      'ancla_del_dia'::text, 2::smallint, 'morning'::text,
      case
        when v_checkin.id is null then 'Nunca se registró una señal subjetiva.'
        else format('Última lectura hace %s h; energía y piernas vencidas.', round(v_edad_min / 60))
      end;
  end if;

  -- 3. Sin objetivo no hay trayectoria contra la cual juzgar nada.
  if coalesce(v_tiene_objetivo, false) = false then
    return query select
      'sin_objetivo'::text, 3::smallint, 'manual'::text,
      'El atleta no tiene objetivo principal definido.'::text;
  end if;

  -- 4. Rescate de noche: el día se va sin haber capturado nada.
  if v_local_hour >= 20 and not v_piernas_ok and not v_energia_ok then
    return query select
      'cierre_sin_datos'::text, 5::smallint, 'pre_sleep'::text,
      'El día termina sin ninguna señal subjetiva vigente.'::text;
  end if;

  -- 5 y 6. Informativos: no generan pregunta al atleta (prompt_type null).
  if v_comidas_hoy = 0 and v_local_hour >= 15 then
    return query select
      'sin_ingesta_registrada'::text, 8::smallint, null::text,
      format('Sin comidas registradas hoy (hora local %s).', v_local_hour);
  end if;

  if v_metricas_hoy = 0 then
    return query select
      'sin_metricas_dispositivo'::text, 9::smallint, null::text,
      'No llegaron métricas del dispositivo hoy.'::text;
  end if;

  return;
end;
$function$;

comment on function public.athlete_context_gaps(uuid, date) is
  'Solo lectura. Devuelve qué señales están vencidas, cada una con su propio plazo. Los plazos deben coincidir con peppe-core/src/thresholds.ts.';

-- ============================================================================
-- PROBAR (no modifica nada)
-- ============================================================================
--   select pr.full_name, g.*
--   from profiles pr
--   cross join lateral public.athlete_context_gaps(pr.id) g
--   order by pr.full_name, g.priority;
--
-- Diferencia esperada respecto de 003: donde antes salía 'sin_checkin_hoy'
-- para todos, ahora debería salir 'ancla_del_dia' con el detalle de cuántas
-- horas lleva vencida la última lectura. Y si alguien entrenó en las últimas
-- 6 horas, ese hueco gana.
-- ============================================================================

-- ============================================================================
-- REVERSIÓN
-- ============================================================================
-- Volver a aplicar 003_context_gaps.sql tal cual. Reemplaza esta versión.
-- ============================================================================
