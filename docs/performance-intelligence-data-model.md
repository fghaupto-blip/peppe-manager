# Peppe Performance Intelligence — data model roadmap

## Principle
Peppe separates high-frequency signals (daily/session) from low-frequency checkpoints (weekly, monthly, 3–6 monthly). The coach owns the training plan; Peppe contextualizes execution, fueling, hydration and recovery.

## High-frequency domains
- Daily readiness: sleep, HRV, resting HR, subjective energy/hunger/stress, pain.
- Fuel availability: estimated from carbohydrate intake, previous load, glucose context and upcoming session.
- Hydration/sweat: pre/post weight, fluids, duration, weather.
- Environment response: temperature, humidity, dew point, wind, UV/AQI, pace/HR/power/RPE response.
- Session response: planned vs actual, pace, HR, power, TSS, RPE, mechanics.
- GI/fuel tolerance: CHO/h, water/h, sodium, caffeine, symptoms.

## Low-frequency domains
- Body composition checkpoints: weight, fat %, fat mass, lean mass, total body water, device, measurement conditions.
- Lab panels/results: panel date, lab/provider, analyte, value, unit, lab range, context. Avoid autonomous clinical diagnosis/prescription.
- Physiological benchmarks: VO2max, threshold/test outcomes, economy benchmarks.
- Interventions/outcomes: what changed, start/end, hypothesis, observed outcome, confidence.

## Supabase tables proposed
- body_composition_checkpoints
- lab_panels
- lab_results
- sweat_tests
- environment_session_context
- session_responses
- gi_fuel_tolerance
- interventions
- intervention_outcomes

Every longitudinal record should include athlete_id, measured_at/date, source, optional device, notes, created_at and provenance/confidence metadata where applicable.
