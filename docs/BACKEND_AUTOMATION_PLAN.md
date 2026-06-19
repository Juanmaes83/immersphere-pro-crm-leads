# Backend Automation Plan v0.1

## Resumen de auditoria

La auditoria confirmo que el ecosistema actual no tiene backend productivo ni GitHub Actions reutilizables.

- CRM `immersphere-pro-crm-leads`: frontend estatico HTML/CSS/JS con `localStorage`. Tiene un bridge Python local en `tools/google-maps-scraper/server.py`, pero no backend productivo.
- Rubik `Rubik-Sota-Director-de-Orquesta`: estatico HTML/Canvas/WebGL con rewrites de Vercel. Sin backend.
- AURUM `AURUM_PROPERTIES_BOUTIQUE`: frontend React/Vite estatico en Vercel. Sin backend.
- No hay `.github/workflows` en raiz de los tres repos auditados.
- No se detectaron secretos reales expuestos.

## Por que el bridge local no sirve como backend productivo

El bridge Python escucha en `127.0.0.1:8765`, esta pensado para uso manual/local y expone scraping/auditoria controlada. No tiene autenticacion productiva, persistencia server-side, cola de jobs, gestion de secretos, integracion con GitHub ni despliegue serverless.

## Arquitectura v0.1

Se crea `automation-backend/` dentro del repo CRM. Es una base local dry-run:

- Node.js.
- TypeScript como estructura fuente.
- HTTP nativo para evitar dependencias innecesarias.
- Validacion estricta del Production Package.
- Sin escritura en Rubik, AURUM ni CRM frontend.
- Sin tokens reales.

## Endpoints

`GET /health`

```json
{
  "ok": true,
  "service": "immersphere-production-orchestrator",
  "version": "0.1.0",
  "mode": "dry-run"
}
```

`POST /api/production/dry-run`

Recibe un Production Package y devuelve un plan no destructivo.

`POST /api/github/dispatch-production`

Siempre responde:

```json
{
  "ok": false,
  "reason": "disabled_in_v0_1_until_security_review"
}
```

## Schema Production Package

Campos minimos:

- `lead`: `id`, `name`, `slug`, `sector`, `zone`, `website`, `email`, `phone`.
- `audit`: `status`, `pagesReviewed`, `signals`, `opportunities`, `weaknesses`.
- `assets`: `logo`, `favicon`, `images`, `video`, `status`.
- `targetRoutes`: `visualExperience`, `landing`, `webCompleta`, `bannerPack`, `bannerVertical`, `bannerHorizontal`.
- `hooks`: `visualExperience`, `landingPage`, `fullWebDemo`, `bannerPack`.
- `rules`: dominios permitidos y `noGeneratedWithout200`.

## Ejemplo request Torrevieja Sur

```json
{
  "lead": {
    "id": "lead_torrevieja_sur",
    "name": "Torrevieja Sur",
    "slug": "torrevieja-sur",
    "sector": "Inmobiliaria",
    "zone": "Torrevieja",
    "website": "https://example.com",
    "email": "hola@example.com",
    "phone": "+34000000000"
  },
  "audit": {
    "status": "complete",
    "pagesReviewed": ["https://example.com"],
    "signals": {},
    "opportunities": ["Experiencia visual de propiedad"],
    "weaknesses": ["Sin tour inmersivo"]
  },
  "assets": {
    "logo": null,
    "favicon": null,
    "images": ["https://example.com/image.jpg"],
    "video": null,
    "status": "candidate"
  },
  "targetRoutes": {
    "visualExperience": "https://aurum-properties-boutique.vercel.app/visual-experience/torrevieja-sur",
    "landing": "https://aurum-properties-boutique.vercel.app/torrevieja-sur",
    "webCompleta": "https://aurum-properties-boutique.vercel.app/torrevieja-sur-web-completa",
    "bannerPack": "https://aurum-properties-boutique.vercel.app/banners/torrevieja-sur",
    "bannerVertical": "https://aurum-properties-boutique.vercel.app/banners/torrevieja-sur/vertical",
    "bannerHorizontal": "https://aurum-properties-boutique.vercel.app/banners/torrevieja-sur/horizontal"
  },
  "hooks": {
    "visualExperience": {},
    "landingPage": {},
    "fullWebDemo": {},
    "bannerPack": {}
  },
  "rules": {
    "clientFacingDomain": "aurum-properties-boutique.vercel.app",
    "internalEngine": "rubik-sota-director-de-orquesta.vercel.app",
    "noGeneratedWithout200": true
  }
}
```

## Ejemplo response dry-run

```json
{
  "ok": true,
  "mode": "dry-run",
  "jobId": "prod_1760000000000_torrevieja-sur",
  "leadSlug": "torrevieja-sur",
  "validation": {
    "passed": true,
    "warnings": [],
    "errors": []
  },
  "plannedRepos": {
    "rubik": {
      "needed": true,
      "plannedBranch": "production/torrevieja-sur-visual-assets",
      "purpose": "Experiencia Visual y Banners"
    },
    "aurum": {
      "needed": true,
      "plannedBranch": "production/torrevieja-sur-public-pages",
      "purpose": "Landing, Web Completa y wrappers publicos"
    },
    "crm": {
      "needed": false,
      "reason": "CRM update only after URLs are real and validated"
    }
  },
  "plannedFiles": [],
  "plannedRoutes": {},
  "qaChecklist": [],
  "nextStep": "review_required"
}
```

## Variables de entorno

Solo se crea `.env.example`:

```text
PORT=8787
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,https://juanmaes83.github.io
DRY_RUN_ONLY=true
INTERNAL_API_TOKEN=change-me-local-only
```

No se usan `GITHUB_TOKEN`, `VERCEL_TOKEN`, PATs, claves privadas ni API keys reales.

## Seguridad

- CORS allowlist.
- Headers basicos: `nosniff`, `DENY`, `no-referrer`, `no-store`.
- Rate limit en memoria.
- Rechazo de slug vacio, path traversal, `/`, `\\`, `%2f`, `%5c`.
- Rechazo de rutas publicas fuera de AURUM.
- Rechazo de `localhost`, `127.0.0.1`, `file://` y `/gesture-lab/`.
- Rechazo de `generated: true`.
- Limite de payload y arrays.
- Sanitizado de branch, slug, filenames y logs.

## GitHub Actions dry-run

`.github/workflows/production-dry-run.yml` usa `workflow_dispatch`, acepta `lead_slug`, `lead_name`, `mode` y `production_package_json`, y falla si `mode` no es `dry-run`.

Permisos:

```yaml
permissions:
  contents: read
```

No crea archivos, no hace commit, no hace push, no despliega y no usa Vercel API.

## Que no hace todavia

- No crea activos reales.
- No modifica Rubik.
- No modifica AURUM.
- No actualiza CRM como `generated`.
- No crea ramas reales en otros repos.
- No abre PRs.
- No despliega previews.
- No usa secretos.

## Fases futuras

- Fase 2: backend productivo desplegado.
- Fase 3: GitHub App o token minimo en backend.
- Fase 4: crear rama por lead.
- Fase 5: generar archivos.
- Fase 6: abrir PR.
- Fase 7: preview deploy.
- Fase 8: registrar URLs reales en CRM.

## Riesgos

- El backend productivo necesitara autenticacion real antes de exponerse.
- Los tokens GitHub/Vercel deben vivir solo en variables de entorno server-side.
- La automatizacion debe abrir PR y esperar revision humana antes de tocar produccion.
- El CRM publico no debe almacenar secretos ni URLs internas como cliente-facing.

## Rollback

Esta fase es aislada. Para revertirla basta con eliminar `automation-backend/`, `.github/workflows/production-dry-run.yml` y este documento.

## QA checklist

- `git diff --check`.
- `npm run build` en `automation-backend`.
- `npm run test` en `automation-backend`.
- Busqueda de secretos.
- Confirmar que `crm.html` e `index.html` no cambian.
- Confirmar que Rubik y AURUM no se tocan.
- Confirmar que los ficheros forenses no se anaden.
