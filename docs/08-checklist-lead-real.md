# Checklist de Lead Real — Pre-create-prs

**Version:** 0.1  
**Uso:** Completar este checklist antes de ejecutar `create-prs` para cualquier lead real.

---

## Bloque 1 — Ficha CRM

- [ ] Nombre del lead confirmado en CRM
- [ ] Nombre comercial normalizado
- [ ] Slug validado (formato kebab-case, sin mayusculas, sin espacios)
- [ ] Sector identificado
- [ ] Ciudad/zona confirmada
- [ ] URL web registrada en CRM o identificada

---

## Bloque 2 — Enriquecimiento desde web oficial

- [ ] Web oficial abierta y confirma respuesta (HTTP 200)
- [ ] Footer revisado
- [ ] Pagina de contacto revisada
- [ ] Cabecera y textos corporativos revisados

### Datos extraidos

| Dato | Confirmado | Fuente |
|---|---|---|
| Email | si / no / no visible | |
| Telefono principal | si / no / no visible | |
| Telefonos adicionales | si / no / no visible | |
| WhatsApp | si / no / no visible | |
| Direccion | si / no / no visible | |
| Horario | si / no / no visible | |
| Tagline | si / no / derivado | |
| Propuesta de valor | si / no / derivado | |

---

## Bloque 3 — Production Package

- [ ] `painDetected` sin placeholders (`url_pendiente_confirmar`, `pendiente de confirmar`)
- [ ] `painDetected` describe dolor comercial real del cliente
- [ ] `callScript` sin referencias a identificadores tecnicos
- [ ] `callScript` es usable tal como esta en una llamada real
- [ ] `claim` sin identificadores tecnicos (`experiencia_visual_premium`, etc.)
- [ ] `proposalSummary` revisado y con datos reales
- [ ] `opportunityDetected` es un clasificador interno (no copy visible)
- [ ] Todos los hooks en `status: "planned"` (no `generated`)
- [ ] `internalNotes` incluye fuente de datos confirmados con fecha

---

## Bloque 4 — Tecnico pre-PRs

- [ ] `github-preflight` ejecutado y `canCreatePRs: true`
- [ ] Ramas no existen (creacion) o existen y seran actualizadas (idempotencia)
- [ ] `GITHUB_PR_AUTOMATION_ENABLED=true` activo en Railway
- [ ] `create-prs` ejecutado UNA SOLA VEZ para este lead

---

## Bloque 5 — Post-PRs

- [ ] PR Rubik creado o actualizado
- [ ] PR AURUM creado o actualizado
- [ ] Diff revisado por humano antes de cualquier merge
- [ ] Merge realizado manualmente, no automaticamente
- [ ] main no tocado hasta merge aprobado

---

## Firma de revision

```
Lead slug: ___________________
Operador: ___________________
Fecha revision: ______________
Datos confirmados desde: _____
```
