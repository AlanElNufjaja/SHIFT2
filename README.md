# Field Shift — Adapting Farms with NASA Data

Herramienta de apoyo a la decisión agrícola diseñada para el reto **Field Shift: Adapting Farms with NASA Data** del NASA Space Apps Challenge.

> **Principio rector:** Field Shift es una herramienta de apoyo y transparencia; **no reemplaza** el criterio del agricultor ni la asesoría agronómica local. Cada indicador muestra su origen (`live`, `cached`, `derived`, `baseline`, `simulated`, `user` o `unavailable`) y sus limitaciones.

## Arquitectura y estructura de carpetas

```text
Space/
├── package.json                  # Workspaces NPM y scripts raíz
├── packages/core/                # Motor isomórfico de decisión (TypeScript puro)
│   ├── src/
│   │   ├── types.ts              # Contratos de datos, proveniencia y salidas
│   │   ├── catalog.ts            # 25 cultivos/coberturas (FAO-56 Kc, FAO-33 Ky, N, mercado)
│   │   ├── sources.ts            # Catálogo de 34 fuentes NASA/agencias, glosario y 6 parcelas piloto
│   │   ├── baseline.ts           # Respaldos climáticos/edafológicos y referencia GRACE
│   │   ├── agronomy.ts           # ET0 Hargreaves, balance hídrico, RUSLE, frío, calor, salinidad
│   │   ├── windows.ts            # Detección de suelo desnudo, helada, calor, erosión y monocultivo
│   │   └── engine.ts             # Motor multi-estrategia (3 años) y simulador de escenarios
│   └── test/engine.test.ts       # Pruebas unitarias (Vitest)
├── apps/server/                  # Backend Node/Express + conectores en vivo + SSE + caché
│   ├── src/
│   │   ├── lib/                  # Caché JSON, cliente HTTP con timeout y proyección Albers EPSG:5070
│   │   ├── connectors/           # NASA POWER, ERA5, MODIS, SRTM, SSURGO/SoilGrids, CDL, NLCD, USGS, CMR/STAC
│   │   ├── harmonize.ts          # Armonización espacial/temporal sobre celda 0.01°
│   │   ├── app.ts                # Endpoints REST + SSE (/api/site/stream) + servido SPA
│   │   ├── index.ts              # Arranque servidor HTTP
│   │   └── smoke.ts              # Verificación en vivo contra APIs reales
│   └── test/server.test.ts       # Pruebas de API (Supertest + Vitest)
└── apps/web/                     # Frontend React 18 + TypeScript + Tailwind + Leaflet + Recharts
    └── src/components/           # Flujo guiado de 5 pasos (Ubicación -> Diagnóstico -> Prioridades -> Estrategias -> Catálogo/Fuentes)
```

## Cómo ejecutar

### Requisitos
- Node.js `>= 20` y `npm`

### Instalación y desarrollo local
```bash
npm install
npm run dev
```
- Frontend Vite: `http://localhost:5173` (con proxy a `/api`)
- Backend Express: `http://localhost:3001`

### Compilación y producción en un solo servidor
```bash
npm run build
npm start
```
El servidor Express sirve automáticamente la app compilada en `http://localhost:3001` cuando existe `apps/web/dist`.

### Variables de entorno opcionales
Todas las fuentes principales (NASA POWER, MODIS ORNL, NASA CMR, ERA5, SRTM, SSURGO, SoilGrids, CropScape CDL, NLCD, USGS Water, Element84 STAC, Planetary Computer) funcionan **sin claves**. Opcionalmente puedes configurar:
- `PORT`: puerto del servidor HTTP (por defecto `3001`; Render lo asigna automáticamente en producción)
- `NASS_API_KEY`: clave gratuita de USDA NASS QuickStats para actualizar precios nacionales en `/api/crops`
- `OPENET_API_KEY`: clave de OpenET para consultar evapotranspiración real 30 m en EE. UU.

## Despliegue en Render

El repositorio incluye el archivo [render.yaml](render.yaml) para desplegar todo el proyecto como un **único Web Service de Node** (el servidor Express expone `/api/*` y sirve automáticamente la interfaz compilada en `apps/web/dist`).

### Opción A: Blueprint automático (recomendada)
1. En el panel de Render selecciona **New + → Blueprint**.
2. Conecta el repositorio de GitHub (`AlanElNufjaja/SHIFT2`) en la rama `main`.
3. Render detectará `render.yaml` y creará el servicio `field-shift` con:
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
   - **Variables base:** `NODE_VERSION=22` y `NODE_ENV=production`
4. Haz clic en **Apply** para iniciar el despliegue.

### Opción B: Web Service manual
Si prefieres crearlo manualmente en Render (**New + → Web Service**):
- **Runtime:** `Node`
- **Root Directory:** *(dejar vacío / raíz del repositorio)*
- **Build Command:** `npm install --include=dev && npm run build`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`
- **Environment Variables:**
  - `NODE_VERSION`: `22`
  - `NODE_ENV`: `production`
  - *(Opcional)* `NASS_API_KEY`: clave gratuita de USDA NASS QuickStats
  - *(Opcional)* `OPENET_API_KEY`: clave de OpenET API

> **Nota:** `PORT` lo inyecta Render automáticamente y el servidor escucha en `0.0.0.0:$PORT`. La aplicación funciona al 100 % sin configurar `NASS_API_KEY` ni `OPENET_API_KEY`.

## Verificación
```bash
npm run typecheck
npm test
npm run build
npm run smoke
```
