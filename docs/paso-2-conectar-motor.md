# Paso 2 · Conectar el motor a la web

## Qué se agrega

```
lib/peppe-adapter.ts        traduce Supabase → formato del motor
app/peppe-debug/page.tsx    pantalla de comparación (temporal)
```

Nada de esto toca la aplicación existente. `/peppe` sigue usando el motor
viejo exactamente igual. La pantalla nueva vive en su propia ruta.

## Cambio obligatorio en tsconfig.json

El paquete `peppe-core` importa con extensión `.ts` (necesario para que los
tests corran con Node sin compilar). Next necesita permiso para eso.

Abre `tsconfig.json` en la raíz y agrega **una línea** dentro de
`compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "allowImportingTsExtensions": true,
    ...resto igual
  }
}
```

Requiere `noEmit: true`, que ya está puesto. No hay otro cambio.

## Probar

```bash
cd ~/Documents/GitHub/peppe-manager
npm run dev
```

Y abre `http://localhost:3000/peppe-debug` con tu sesión iniciada.

## Qué vas a ver

Una tabla con los dos motores lado a lado. **Las filas que difieren salen
resaltadas en amarillo.**

Diferencias esperadas, que confirman que el motor nuevo funciona:

| Fila | Qué esperar |
|---|---|
| Piernas usables | "descartadas (escala sin declarar)" hasta que corras `002_escala_piernas.sql` |
| Guardarraíles | El viejo no tiene. Siempre va a diferir |
| Confianza | El viejo no la calcula. Siempre va a diferir |
| Momento | **Deberían coincidir.** Si difieren, hay que mirarlo |
| Preguntas | Pueden diferir por lo de piernas. Cualquier otra diferencia, mirarla |

Abajo aparece el bloque "Por qué decidió esto", que lista cada regla que
disparó con sus valores. Esa es la trazabilidad que el motor viejo no tiene:
sirve para juzgar si el criterio de Peppe es razonable, en vez de tener que
adivinarlo leyendo código.

## Qué hacer con lo que veas

Si el momento y las preguntas coinciden (salvo piernas), el motor está
validado y se puede reemplazar en `/peppe`.

Si difieren en algo más, mándame captura de la tabla y del bloque de razones.
Con eso sé exactamente qué regla ajustar.

## Después

Una vez validado:

1. Correr `002_escala_piernas.sql` para que las filas nuevas declaren su escala
2. Reemplazar `buildPeppeDecision` por `decide` en `app/peppe/page.tsx`
3. Repetir en las demás pantallas
4. Borrar los tres motores viejos y esta página de debug
