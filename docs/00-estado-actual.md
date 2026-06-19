# Estado Actual del Sistema Immersphere CRM

**Ultima actualizacion:** 2026-06-20

---

## Sistema

| Componente | Estado |
|---|---|
| CRM panel estatico | Activo — https://juanmaes83.github.io/immersphere-pro-crm-leads/ |
| Backend Railway | Activo v0.3.0 — https://automation-backend-production-02e5.up.railway.app |
| Operator Console | Activo — /operator |
| GitHub PR automation | Activo (`GITHUB_PR_AUTOMATION_ENABLED=true`) |

---

## Leads procesados

### Piloto-D (datos de prueba, no lead real)
- Rubik PR #5: `production/piloto-d-visual-assets` — abierto, no mergeado (referencia)
- AURUM PR #1: `production/piloto-d-public-pages` — abierto, no mergeado (referencia)
- Estado: validado como piloto del sistema completo

### Sandhouse Inmobiliaria (primer lead real)
- Slug: `sandhouse-inmobiliaria`
- Web: https://www.sandhouse.es/
- Zona: Torrevieja, Alicante
- Rubik PR #6: `production/sandhouse-inmobiliaria-visual-assets` — **listo para revision humana**
- AURUM PR #2: `production/sandhouse-inmobiliaria-public-pages` — **listo para revision humana**
- Correcciones comerciales aplicadas: v0.4, v0.4.1, v0.4.2, v0.4.3
- Estado: sin merge, revision humana pendiente

---

## Reglas vigentes

1. **Enriquecimiento obligatorio desde web oficial** antes de cualquier Production Package (desde v0.4.3)
2. No hay merge automatico — siempre revision humana previa
3. `generated` nunca se marca hasta validar URLs reales con 200
4. `GITHUB_SERVER_TOKEN` (Classic PAT, expira 90 dias desde 2026-06-19) — no compartir nunca en chat
5. No se ejecuta `create-prs` mas de una vez por lead sin autorizacion explicita

---

## Documentacion activa

- [02-workflow-crm-backend-prs.md](./02-workflow-crm-backend-prs.md) — Flujo completo
- [07-protocolo-enriquecimiento-leads.md](./07-protocolo-enriquecimiento-leads.md) — Protocolo de datos
- [08-checklist-lead-real.md](./08-checklist-lead-real.md) — Checklist pre-create-prs

---

## Proximos pasos

1. Revision humana de Rubik PR #6 y AURUM PR #2
2. Merge manual si todo correcto
3. Rotar Classic PAT antes de 2026-09-17 (90 dias desde emision)
4. Primer lead real completado = Sandhouse Inmobiliaria
