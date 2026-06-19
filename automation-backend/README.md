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

## Limites

Este backend no es todavia productivo. La ejecucion real con GitHub, Vercel, PRs y registro de URLs queda bloqueada hasta revision de seguridad.
