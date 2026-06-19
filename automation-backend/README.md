# Immersphere Production Orchestrator v0.1

Backend local y aislado para preparar automatizacion de produccion en modo dry-run.

## Que hace

- Expone `GET /health`.
- Expone `POST /api/production/dry-run`.
- Expone `POST /api/github/dispatch-production`, pero queda desactivado en v0.1.
- Valida un Production Package antes de planificar ramas, rutas y QA.
- No crea archivos reales.
- No ejecuta comandos shell con datos del usuario.
- No hace commits, push ni deploys.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run test
```

## Variables

Copiar `.env.example` solo como referencia. No crear ni commitear `.env`.

```text
PORT=8787
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,https://juanmaes83.github.io
DRY_RUN_ONLY=true
INTERNAL_API_TOKEN=change-me-local-only
```

`INTERNAL_API_TOKEN` queda reservado para una fase posterior. No se usan tokens reales en v0.1.

En despliegue Railway v0.1.2 se recomienda activar `INTERNAL_API_TOKEN` como variable de entorno. Si el valor existe y no es `change-me-local-only`, los endpoints `POST` exigen el header:

```text
x-internal-api-token: <valor-configurado-en-railway>
```

`GET /health` queda publico para healthcheck.

## Endpoint dry-run

```bash
curl -X POST http://127.0.0.1:8787/api/production/dry-run \
  -H "Content-Type: application/json" \
  --data @production-package.json
```

La respuesta valida el paquete y devuelve un plan no destructivo con ramas, rutas y checklist de QA.

## Seguridad v0.1

- CORS allowlist.
- Headers basicos de seguridad.
- Rate limit local en memoria.
- Rechazo de slugs inseguros.
- Rechazo de URLs `localhost`, `127.0.0.1`, `file://`, dominios no AURUM y `/gesture-lab/`.
- Rechazo de `generated: true`.
- Limite de tamano de payload.
- Limites de arrays y strings.
- Sanitizado de slug, branch, nombres de archivo y logs.

## Asset & Template Pipeline

El endpoint dry-run usa `mediaAssets` como fuente principal y mantiene compatibilidad con `assets` legacy si `mediaAssets` no existe.

Fotos:

- `logo`, `heroImage` y `propertyImages` se validan antes de planificar.
- Las imagenes `candidate` o `pending_validation` generan warnings.
- Las imagenes con `source: "stock"` o `source: "placeholder"` generan riesgo de derechos/uso.
- Los assets detectados desde web publica no deben pasar a `approved` automaticamente.

Videos:

- `videos` permite piezas propias o fallback.
- `/VIDEO_AURUM_HEROWEB.mp4` se acepta como fallback AURUM para Web Completa, pero siempre genera warning.
- Si no hay video propio, el plan marca riesgo visual antes de produccion.

Banderola dinamica:

- G1 se planifica como `dynamic-motion-banner`, no como imagen estatica.
- Rubik queda como motor interno con HTML limpio, config de cliente, assets y modo embed.
- AURUM queda como wrapper publico limpio en `/visual-experience/[slug]`.
- Nunca se debe exponer `/gesture-lab/` como URL cliente-facing.

Banners:

- G4 planifica pack publico en AURUM: `/banners/[slug]`, `/banners/[slug]/vertical`, `/banners/[slug]/horizontal`.
- Rubik planifica `banner-vertical.html`, `banner-horizontal.html`, `config.js` y `banner-engine.js` o dependencia equivalente.
- Si hay imports relativos, el wrapper debe apuntar al `.html` directo, no a un rewrite que rompa modulos.

Landing y Web Completa:

- Landing usa template `aurum-landing` y no equivale a Web Completa.
- Web Completa usa `aurum-web-completa-blueprint`.
- Web Completa exige `heroVideoMotion: true`, hero video/motion AURUM, GSAP + SplitType en h1, minimo 8 secciones, `VisualExperienceBannerSection`, CTA principal y cero contenido cruzado.

La respuesta incluye `plannedTemplates`, `plannedFiles`, `mediaPlan` y `visualRisks`. No se crea ningun archivo real en Rubik o AURUM en v0.1.

## Railway Dry-Run Deployment v0.1.2

Estado de esta fase: preparado para despliegue manual en Railway. El CLI `railway` no estaba disponible localmente, por lo que no se hizo deploy real desde Codex.

Configuracion esperada en Railway:

- Root directory: `automation-backend/`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Healthcheck path: `/health`
- Node: `24`, via `nixpacks.toml`

Variables:

```text
NODE_ENV=production
DRY_RUN_ONLY=true
ALLOWED_ORIGINS=https://juanmaes83.github.io,http://localhost:5500,http://127.0.0.1:5500
INTERNAL_API_TOKEN=<crear-en-railway-no-en-git>
```

No configurar `GITHUB_TOKEN`, `VERCEL_TOKEN`, PATs, claves privadas ni API keys reales.

Auth elegida: token manual temporal. Es la opcion mas prudente para un endpoint online aunque siga siendo dry-run. El CRM no se conecta todavia y el token no debe ponerse en frontend.

Comandos de smoke test, sustituyendo `RAILWAY_URL` y el token:

```bash
curl https://RAILWAY_URL/health

curl -X POST https://RAILWAY_URL/api/production/dry-run \
  -H "Content-Type: application/json" \
  -H "x-internal-api-token: $INTERNAL_API_TOKEN" \
  --data @production-package.json

curl -X POST https://RAILWAY_URL/api/github/dispatch-production \
  -H "Content-Type: application/json" \
  -H "x-internal-api-token: $INTERNAL_API_TOKEN" \
  --data "{}"
```

`dispatch-production` debe seguir respondiendo:

```json
{
  "ok": false,
  "reason": "disabled_in_v0_1_until_security_review"
}
```

Rollback/apagado:

- Railway dashboard -> servicio -> Deployments -> Rollback al deploy anterior, o
- Railway dashboard -> servicio -> Settings -> Stop/Delete service si solo era una prueba.

Siguiente fase recomendada: GitHub PR Automation v0.2, todavia con PR y revision humana antes de produccion real.

## Limites

Este backend no es todavia productivo. La ejecucion real con GitHub, Vercel, PRs y registro de URLs queda bloqueada hasta revision de seguridad.
