# Peppe Mobile

App nativa iOS + Android de Peppe Manager, construida con Expo/React Native y conectada al mismo Supabase que la web.

## Primer enlace con Expo/EAS

Desde la raíz del repositorio:

```bash
cd mobile
npm install
npx eas-cli@latest login --browser
npx eas-cli@latest init
```

Cuando `eas init` termine, Expo habrá creado/vinculado el EAS project y asignado un `projectId`.

## Primer development build

### iOS

```bash
npx eas-cli@latest build --profile development --platform ios
```

Para instalar en un iPhone físico, EAS pedirá registrar el dispositivo y configurar las credenciales de Apple. Se requiere Apple Developer Program para firmar builds de iOS para dispositivo.

### Android

```bash
npx eas-cli@latest build --profile development --platform android
```

## Notificaciones

Al abrir Peppe Mobile:

1. Inicia sesión con la misma cuenta de Peppe web.
2. Presiona **Activar notificaciones**.
3. Acepta el permiso del sistema.
4. El Expo Push Token se guarda en `device_push_tokens` de Supabase.
5. Las notificaciones pueden abrir directamente `/moment`.

## Arquitectura

- Web/coach: raíz del repositorio (Next.js + Vercel)
- Mobile/atleta: `mobile/` (Expo + React Native)
- Backend común: Supabase

## Variables públicas

Supabase usa una publishable key protegida por RLS. Los valores de ejemplo están en `.env.example`.
