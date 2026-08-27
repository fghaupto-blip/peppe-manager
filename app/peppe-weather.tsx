'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';

type Coords = { latitude: number; longitude: number };
type Plan = { title: string | null; scheduled_at: string; intensity: string | null; notes: string | null };
type ForecastPoint = {
  time: string;
  temperature: number;
  apparent: number;
  humidity: number;
  precipProbability: number;
  precipitation: number;
  wind: number;
  gust: number;
  code: number;
};

type WeatherReading = {
  point: ForecastPoint;
  score: number;
  status: 'Favorable' | 'Con precaución' | 'Desfavorable';
  reasons: string[];
};

function useDelayedMount(pathname: string, expectedPath: string, selector: string, id: string, position: 'before' | 'after' = 'after') {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMount(null);
    if (pathname !== expectedPath) return;
    let created: HTMLElement | null = null;
    let stopped = false;
    const tryMount = () => {
      if (stopped || created) return Boolean(created);
      const anchor = document.querySelector(selector);
      if (!anchor || !anchor.parentElement) return false;
      created = document.createElement('div');
      created.id = id;
      if (position === 'before') anchor.parentElement.insertBefore(created, anchor);
      else anchor.parentElement.insertBefore(created, anchor.nextSibling);
      setMount(created);
      return true;
    };
    if (!tryMount()) {
      const observer = new MutationObserver(() => {
        if (tryMount()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timer = window.setInterval(() => {
        if (tryMount()) window.clearInterval(timer);
      }, 250);
      return () => {
        stopped = true;
        observer.disconnect();
        window.clearInterval(timer);
        created?.remove();
      };
    }
    return () => {
      stopped = true;
      created?.remove();
    };
  }, [pathname, expectedPath, selector, id, position]);
  return mount;
}

function scoreWeather(point: ForecastPoint): WeatherReading {
  let score = 100;
  const reasons: string[] = [];

  if (point.code >= 95) {
    score -= 80;
    reasons.push('riesgo de tormenta');
  } else if ([65, 67, 75, 77, 82, 86].includes(point.code)) {
    score -= 45;
    reasons.push('precipitación intensa');
  }

  if (point.precipProbability >= 70) {
    score -= 30;
    reasons.push(`${Math.round(point.precipProbability)}% prob. de precipitación`);
  } else if (point.precipProbability >= 45) {
    score -= 14;
    reasons.push(`${Math.round(point.precipProbability)}% prob. de precipitación`);
  }

  if (point.precipitation >= 2) {
    score -= 28;
    reasons.push(`${point.precipitation.toFixed(1)} mm/h`);
  } else if (point.precipitation >= 0.5) {
    score -= 10;
  }

  if (point.wind >= 35) {
    score -= 28;
    reasons.push(`viento ${Math.round(point.wind)} km/h`);
  } else if (point.wind >= 25) {
    score -= 12;
    reasons.push(`viento ${Math.round(point.wind)} km/h`);
  }

  if (point.gust >= 50) {
    score -= 22;
    reasons.push(`ráfagas ${Math.round(point.gust)} km/h`);
  } else if (point.gust >= 40) {
    score -= 10;
  }

  if (point.apparent >= 31) {
    score -= 35;
    reasons.push(`sensación ${Math.round(point.apparent)}°C`);
  } else if (point.apparent >= 27) {
    score -= 14;
    reasons.push(`sensación ${Math.round(point.apparent)}°C`);
  } else if (point.apparent <= 0) {
    score -= 22;
    reasons.push(`sensación ${Math.round(point.apparent)}°C`);
  } else if (point.apparent <= 4) {
    score -= 8;
  }

  if (point.humidity >= 90 && point.apparent >= 20) score -= 8;
  score = Math.max(0, Math.min(100, score));
  const status = score >= 75 ? 'Favorable' : score >= 50 ? 'Con precaución' : 'Desfavorable';
  return { point, score, status, reasons };
}

function formatPointTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function weatherLabel(code: number) {
  if (code === 0) return 'despejado';
  if ([1, 2, 3].includes(code)) return 'nubes parciales';
  if ([45, 48].includes(code)) return 'niebla';
  if ([51, 53, 55, 56, 57].includes(code)) return 'llovizna';
  if ([61, 63, 65, 66, 67].includes(code)) return 'lluvia';
  if ([71, 73, 75, 77].includes(code)) return 'nieve';
  if ([80, 81, 82].includes(code)) return 'chubascos';
  if (code >= 95) return 'tormenta';
  return 'variable';
}

export default function PeppeWeather() {
  const pathname = usePathname();
  const homeMount = useDelayedMount(pathname, '/', '.home-question-copy', 'peppe-weather-home', 'after');
  const peppeMount = useDelayedMount(pathname, '/peppe', '.peppe-analysis-head', 'peppe-weather-analysis', 'after');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'error'>('idle');
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [forecastError, setForecastError] = useState('');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('peppe_weather_coords');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
          setCoords({ latitude: parsed.latitude, longitude: parsed.longitude });
          setLocationState('ready');
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (pathname !== '/' && pathname !== '/peppe') return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const now = new Date().toISOString();
      const horizon = new Date(Date.now() + 36 * 3600000).toISOString();
      const result = await supabase
        .from('planned_sessions')
        .select('title,scheduled_at,intensity,notes')
        .eq('athlete_id', data.user.id)
        .eq('status', 'planned')
        .gte('scheduled_at', now)
        .lte('scheduled_at', horizon)
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      setPlan((result.data as Plan | null) ?? null);
    });
  }, [pathname]);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    const load = async () => {
      setForecastError('');
      try {
        const params = new URLSearchParams({
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
          hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
          forecast_days: '3',
          timezone: 'auto',
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
        if (!response.ok) throw new Error('weather');
        const json = await response.json();
        const hourly = json.hourly;
        const points: ForecastPoint[] = (hourly?.time || []).map((time: string, index: number) => ({
          time,
          temperature: Number(hourly.temperature_2m?.[index] ?? 0),
          apparent: Number(hourly.apparent_temperature?.[index] ?? 0),
          humidity: Number(hourly.relative_humidity_2m?.[index] ?? 0),
          precipProbability: Number(hourly.precipitation_probability?.[index] ?? 0),
          precipitation: Number(hourly.precipitation?.[index] ?? 0),
          wind: Number(hourly.wind_speed_10m?.[index] ?? 0),
          gust: Number(hourly.wind_gusts_10m?.[index] ?? 0),
          code: Number(hourly.weather_code?.[index] ?? 0),
        })).filter((point: ForecastPoint) => {
          const diff = new Date(point.time).getTime() - Date.now();
          return diff >= -60 * 60 * 1000 && diff <= 36 * 3600000;
        });
        if (!cancelled) setForecast(points);
      } catch {
        if (!cancelled) setForecastError('No pude actualizar el clima ahora. Peppe seguirá con el resto del contexto.');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [coords]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState('error');
      return;
    }
    setLocationState('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCoords(next);
        setLocationState('ready');
        window.localStorage.setItem('peppe_weather_coords', JSON.stringify(next));
      },
      (error) => {
        setLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
  }

  const analysis = useMemo(() => {
    if (!forecast.length) return null;
    const evaluated = forecast.map(scoreWeather);
    const targetTime = plan?.scheduled_at ? new Date(plan.scheduled_at).getTime() : null;
    const target = targetTime == null ? null : evaluated.reduce<WeatherReading | null>((best, item) => {
      const distance = Math.abs(new Date(item.point.time).getTime() - targetTime);
      if (!best) return item;
      const bestDistance = Math.abs(new Date(best.point.time).getTime() - targetTime);
      return distance < bestDistance ? item : best;
    }, null);

    const candidatePool = evaluated.filter((item) => {
      const hour = new Date(item.point.time).getHours();
      return hour >= 5 && hour <= 22;
    });
    const best = [...candidatePool].sort((a, b) => b.score - a.score)[0] || evaluated[0];
    return { target, best };
  }, [forecast, plan]);

  const card = (compact = false) => {
    const target = analysis?.target;
    const best = analysis?.best;
    const title = plan?.title || 'el entrenamiento de las próximas 36 h';
    const needsAlternative = Boolean(target && target.status === 'Desfavorable' && best && best.score >= target.score + 15);

    return <section className={`peppe-weather-card ${compact ? 'compact' : ''}`}>
      <div className="peppe-weather-head">
        <div>
          <span className="eyebrow">CLIMA · 36 HORAS</span>
          <strong>¿El plan se puede cumplir como está?</strong>
        </div>
        {target && <span className={`peppe-weather-status status-${target.status.replaceAll(' ', '-').toLowerCase()}`}>{target.status}</span>}
      </div>

      {!coords ? <div className="peppe-weather-permission">
        <p>Peppe puede cruzar tu próxima sesión con lluvia, temperatura, viento y ráfagas para anticipar si conviene mantener el horario o buscar una mejor ventana dentro de 24–36 horas.</p>
        <button type="button" onClick={requestLocation} disabled={locationState === 'loading'}>{locationState === 'loading' ? 'Buscando ubicación…' : 'Usar mi ubicación para revisar clima'}</button>
        {locationState === 'denied' && <small>La ubicación está bloqueada en el navegador. Puedes habilitarla para Peppe y volver a intentar.</small>}
      </div> : forecastError ? <p className="peppe-weather-error">{forecastError}</p> : !analysis ? <p className="peppe-weather-loading">Revisando el pronóstico de las próximas 36 horas…</p> : <>
        {target ? <div className="peppe-weather-main">
          <div><span>PLAN</span><strong>{title}</strong><small>{formatPointTime(target.point.time)}</small></div>
          <div><span>CONDICIONES</span><strong>{Math.round(target.point.apparent)}°C · {weatherLabel(target.point.code)}</strong><small>{Math.round(target.point.precipProbability)}% lluvia · viento {Math.round(target.point.wind)} km/h · ráfagas {Math.round(target.point.gust)} km/h</small></div>
        </div> : <p className="peppe-weather-summary">No veo una sesión programada dentro de 36 horas, pero Peppe ya tiene una ventana climática preparada para cuando aparezca el próximo entrenamiento.</p>}

        <div className="peppe-weather-decision">
          <span>DECISIÓN PEPPE</span>
          {target?.status === 'Favorable' && <p><b>Mantendría el horario.</b> El clima no agrega una razón relevante para mover {title}. Volvemos a verificar unas horas antes.</p>}
          {target?.status === 'Con precaución' && <p><b>El plan es posible, con vigilancia.</b> {target.reasons.length ? `Peppe ve ${target.reasons.slice(0, 2).join(' y ')}.` : 'Hay alguna variable climática que merece seguimiento.'} Revisa nuevamente 2–3 horas antes.</p>}
          {target?.status === 'Desfavorable' && <p><b>No cerraría el horario todavía.</b> {target.reasons.length ? `La principal alerta es ${target.reasons.slice(0, 2).join(' y ')}.` : 'Las condiciones son poco favorables.'} {needsAlternative ? `Dentro de 36 h aparece una mejor ventana: ${formatPointTime(best!.point.time)}.` : 'Peppe seguirá buscando una ventana más razonable dentro de 24–36 h.'}</p>}
          {!target && best && <p><b>Mejor ventana climática visible:</b> {formatPointTime(best.point.time)} · {Math.round(best.point.apparent)}°C · {Math.round(best.point.precipProbability)}% lluvia · viento {Math.round(best.point.wind)} km/h.</p>}
        </div>
      </>}
      <small className="peppe-weather-note">El clima no modifica por sí solo el plan del coach: Peppe lo usa para decidir horario, equipamiento, hidratación y si conviene revisar una alternativa segura.</small>
    </section>;
  };

  return <>
    {homeMount ? createPortal(card(true), homeMount) : null}
    {peppeMount ? createPortal(card(false), peppeMount) : null}
  </>;
}
