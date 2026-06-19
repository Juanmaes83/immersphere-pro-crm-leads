# Backend Automation Plan v0.2

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

### `mediaAssets`

`mediaAssets` es la fuente principal para planificar los 4 ganchos. `assets` se mantiene como compatibilidad legacy.

```json
{
  "mediaAssets": {
    "logo": {
      "url": "https://cdn.example.com/torrevieja-sur/logo.png",
      "source": "manual",
      "status": "approved"
    },
    "favicon": {
      "url": "https://cdn.example.com/torrevieja-sur/favicon.ico",
      "status": "candidate"
    },
    "heroImage": {
      "url": "https://cdn.example.com/torrevieja-sur/hero.jpg",
      "status": "approved"
    },
    "propertyImages": [
      {
        "url": "https://cdn.example.com/torrevieja-sur/gallery-1.jpg",
        "source": "manual",
        "status": "approved",
        "recommendedUse": "hero"
      }
    ],
    "videos": [
      {
        "url": "/VIDEO_AURUM_HEROWEB.mp4",
        "source": "aurum_default",
        "status": "candidate",
        "recommendedUse": "hero"
      }
    ],
    "brandColors": ["#111111", "#d8b46a"],
    "notes": ["Validar derechos antes de produccion."]
  }
}
```

Validaciones:

- Warning si falta logo, hero image, property images o video propio.
- Warning si se usa `/VIDEO_AURUM_HEROWEB.mp4`.
- Warning si hay assets `candidate` o `pending_validation`.
- Warning si no hay assets `approved`.
- Error si una media URL usa `localhost`, `127.0.0.1`, `file://` o `/gesture-lab/`.
- Warning si hay riesgo de derechos de uso por `stock`, `placeholder` o asset detectado por scraping publico.
- Error si Web Completa no declara `hooks.fullWebDemo.heroVideoMotion: true`.

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
    "mediaAssets": {
      "logo": {
        "url": "https://cdn.example.com/torrevieja-sur/logo.png",
        "source": "manual",
        "status": "approved"
      },
      "favicon": {
        "url": "https://cdn.example.com/torrevieja-sur/favicon.ico",
        "status": "candidate"
      },
      "heroImage": {
        "url": "https://cdn.example.com/torrevieja-sur/hero.jpg",
        "status": "approved"
      },
      "propertyImages": [
        {
          "url": "https://cdn.example.com/torrevieja-sur/gallery-1.jpg",
          "source": "manual",
          "status": "approved",
          "recommendedUse": "hero"
        }
      ],
      "videos": [
        {
          "url": "/VIDEO_AURUM_HEROWEB.mp4",
          "source": "aurum_default",
          "status": "candidate",
          "recommendedUse": "hero"
        }
      ],
      "brandColors": ["#111111", "#d8b46a"],
      "notes": ["Validar derechos antes de produccion."]
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
  "plannedTemplates": {
    "visualExperience": "dynamic-motion-banner",
    "landing": "aurum-landing",
    "webCompleta": "aurum-web-completa-blueprint",
    "bannerPack": "dynamic-motion-banner-pack"
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
  "plannedFiles": [
    {
      "repo": "Rubik",
      "path": "dynamic-motion-banner/torrevieja-sur/index.html",
      "purpose": "Experiencia Visual / Banderola",
      "template": "dynamic-motion-banner",
      "requiresAssets": ["logo", "heroImage", "brandColors"],
      "risk": "requires media validation"
    },
    {
      "repo": "Rubik",
      "path": "dynamic-motion-banner/torrevieja-sur/banner-vertical.html",
      "purpose": "Banner vertical",
      "template": "dynamic-motion-banner-pack",
      "requiresAssets": ["logo", "heroImage", "claim", "cta"],
      "risk": "iframe wrappers must point to direct html when relative imports exist"
    },
    {
      "repo": "AURUM",
      "path": "src/TorreviejaSurWebCompleta.tsx",
      "purpose": "Web Completa",
      "template": "aurum-web-completa-blueprint",
      "requiresAssets": ["heroVideo", "heroImage", "VisualExperienceBannerSection"],
      "risk": "must preserve hero video/motion"
    }
  ],
  "plannedRoutes": {},
  "mediaPlan": {
    "logo": {},
    "heroImage": {},
    "videos": [],
    "warnings": ["mediaPlan.videos: VIDEO_AURUM_HEROWEB.mp4 fallback in use"]
  },
  "visualRisks": [
    "Web completa will use VIDEO_AURUM_HEROWEB.mp4 fallback until own video is approved."
  ],
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

## Railway Dry-Run Deployment v0.1.2

Estado: preparado para despliegue manual en Railway. En la maquina local de auditoria el CLI `railway` no estaba disponible (`railway --version` y `railway whoami` fallaron porque el comando no existe), por lo que no se hizo deploy real ni se simulo una URL.

Configuracion Railway:

- Root directory: `automation-backend/`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Healthcheck path: `/health`
- Node runtime: `24`, fijado en `nixpacks.toml`
- El servidor escucha `0.0.0.0` y usa `PORT` inyectado por Railway.

Variables recomendadas:

```text
NODE_ENV=production
DRY_RUN_ONLY=true
ALLOWED_ORIGINS=https://juanmaes83.github.io,http://localhost:5500,http://127.0.0.1:5500
INTERNAL_API_TOKEN=<crear-en-railway-no-en-git>
```

No configurar:

```text
GITHUB_TOKEN
VERCEL_TOKEN
PAT
RESEND_API_KEY
GOOGLE_CLIENT_SECRET
PRIVATE KEY
API_KEY real
```

Auth elegida: **Opcion B - token manual temporal**.

Motivo: aunque el backend no escribe, no usa tokens de terceros, tiene rate limit y dispatch real bloqueado, un endpoint online no debe aceptar paquetes de produccion sin una barrera minima. El token vive solo en Railway y se envia en pruebas manuales con `x-internal-api-token`. El CRM no se conecta todavia y el token no debe ir en frontend.

Endpoints:

- `GET /health`: publico para healthcheck.
- `POST /api/production/dry-run`: exige `x-internal-api-token` si `INTERNAL_API_TOKEN` esta configurado.
- `POST /api/github/dispatch-production`: exige token y sigue bloqueado.

Comandos curl:

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

Ejemplo response health:

```json
{
  "ok": true,
  "service": "immersphere-production-orchestrator",
  "version": "0.1.0",
  "mode": "dry-run"
}
```

Ejemplo response dispatch bloqueado:

```json
{
  "ok": false,
  "reason": "disabled_in_v0_1_until_security_review"
}
```

Que sigue desactivado:

- Creacion de archivos.
- Commits.
- Push.
- Vercel API.
- GitHub tokens.
- Registro de URLs reales en CRM.
- Conexion del CRM al backend.

Rollback/apagado:

- Railway dashboard -> servicio -> Deployments -> Rollback, o
- Railway dashboard -> servicio -> Settings -> Stop/Delete service si era un entorno temporal.

Siguiente fase: **GitHub PR Automation v0.2**, con GitHub App/token minimo en backend, rama por lead, PR y revision humana. No debe escribir en `main`.

## GitHub PR Automation v0.2

Objetivo: preparar la automatizacion real sin activarla todavia en produccion.

Nuevos endpoints:

- `GET /api/production/capabilities`: expone capacidades y flags, no secretos.
- `GET /api/production/jobs`: lista jobs en memoria.
- `GET /api/production/jobs/{jobId}`: consulta estado de un job.
- `POST /api/production/pr-plan`: construye plan de PRs, archivos y paquete comercial sin escribir en GitHub.
- `POST /api/production/proposal-package`: devuelve briefing comercial para CRM sin enviar WhatsApp/email.
- `POST /api/production/create-prs`: preparado para crear ramas y PRs, bloqueado por defecto.

Variables nuevas:

```text
PROPOSAL_PACKAGE_ENABLED=true
GITHUB_PR_AUTOMATION_ENABLED=false
GITHUB_SERVER_TOKEN=
GITHUB_ALLOWED_REPOS=Juanmaes83/Rubik-Sota-Director-de-Orquesta,Juanmaes83/AURUM_PROPERTIES_BOUTIQUE
```

`GITHUB_PR_AUTOMATION_ENABLED=false` es obligatorio hasta la siguiente revision. Sin esa flag, el backend responde `disabled_until_security_flags_enabled` y `writeAttempted: false`.

`GITHUB_SERVER_TOKEN` no se configura todavia. Cuando exista, debe ser server-side, con permisos minimos y nunca expuesto en frontend.

Repos permitidos:

- `Juanmaes83/Rubik-Sota-Director-de-Orquesta`
- `Juanmaes83/AURUM_PROPERTIES_BOUTIQUE`

Repos bloqueados:

- `Juanmaes83/immersphere-pro-crm-leads`
- cualquier repo fuera de allowlist

Rutas permitidas en Rubik:

- `dynamic-motion-banner/{slug}/README.md`
- `dynamic-motion-banner/{slug}/config.json`
- `dynamic-motion-banner/{slug}/index.html`
- `dynamic-motion-banner/{slug}/banner-vertical.html`
- `dynamic-motion-banner/{slug}/banner-horizontal.html`
- `dynamic-motion-banner/{slug}/assets-manifest.json`
- `production-manifests/{slug}.json`

Rutas permitidas en AURUM:

- `production-manifests/{slug}.json`
- `src/generated/{ComponentBase}ProductionPlan.ts`
- `src/generated/{ComponentBase}ProposalPackage.ts`

Rutas siempre bloqueadas:

- `crm.html`
- `index.html`
- `.env`
- `.claude`
- `.vercel`
- `node_modules`
- `package-lock.json`
- rutas absolutas
- rutas con `..`, `\`, `%2f` o `%5c`

El GitHub client v0.2 solo contempla crear rama, subir archivos allowlisted y abrir PR con revision humana. No contiene endpoint de merge ni toca `main`.

## Proposal Package v0.2

El backend puede generar un paquete comercial desde el Production Package:

- resumen de oportunidad;
- 4 ganchos comerciales;
- briefing EV;
- briefing landing;
- briefing Web Completa;
- briefing pack banners;
- WhatsApp sugerido;
- asunto y cuerpo de email;
- guion de llamada;
- mensaje de seguimiento;
- notas internas;
- checklist de revision.

No envia WhatsApp, no envia email y no registra URLs en CRM.

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

## Asset & Template Pipeline

El dry-run v0.1.1 ya responde que se usaria antes de crear nada.

Fotos:

- `logo` alimenta banderola, banners y cabeceras.
- `heroImage` alimenta landing, Web Completa y fondos.
- `propertyImages` se separa por `recommendedUse`: `hero`, `gallery`, `banner`, `background`.
- Si faltan imagenes, se devuelve warning y riesgo visual.

Videos:

- El video propio se prioriza para hero/background.
- `/VIDEO_AURUM_HEROWEB.mp4` se acepta como fallback premium AURUM, pero nunca como validacion final de video propio.
- El fallback genera warning para que la revision humana lo vea.

Banderola dinamica:

- G1 usa template `dynamic-motion-banner`.
- Rubik planifica `dynamic-motion-banner/[slug]/index.html`, `config.js`, assets del cliente y modo embed.
- AURUM planifica wrapper publico `/visual-experience/[slug]`.
- Rubik es motor interno; AURUM es URL publica.

Banners vertical/horizontal:

- AURUM planifica `/banners/[slug]`, `/banners/[slug]/vertical` y `/banners/[slug]/horizontal`.
- Rubik planifica `banner-vertical.html`, `banner-horizontal.html`, `config.js` y `banner-engine.js`.
- Si las piezas HTML usan imports relativos, el iframe debe apuntar al HTML directo.

Landing Comercial:

- Usa template `aurum-landing`.
- Planifica componente landing, ruta `/[slug]`, copy comercial, CTA, assets candidatos y fallback premium.
- Landing no equivale a Web Completa.

Web Desarrollada Completa:

- Usa template `aurum-web-completa-blueprint`.
- Planifica `src/[ComponentName]WebCompleta.tsx` y ruta `/[slug]-web-completa`.
- Exige hero video/motion AURUM, `/VIDEO_AURUM_HEROWEB.mp4` como fallback si falta video propio, GSAP + SplitType en h1, minimo 8 secciones, `VisualExperienceBannerSection`, CTA principal, responsive, cero contenido cruzado y cero placeholders criticos.

Que no crea todavia:

- No genera HTML/TSX real.
- No copia assets.
- No modifica Rubik.
- No modifica AURUM.
- No abre PRs.

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
