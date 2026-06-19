# Workflow CRM → Backend → PRs

**Version:** 0.2  
**Fecha actualizacion:** 2026-06-20

---

## Flujo completo de un lead real

```
1. Lead entra en CRM (panel estatico)
2. Operador revisa ficha CRM
3. [OBLIGATORIO] Enriquecimiento de datos desde web oficial / contacto / footer
4. Operador abre Operator Console (Railway /operator)
5. Login con OPERATOR_ADMIN_TOKEN
6. Paso pr-plan: revisar estructura del paquete
7. Paso github-preflight: verificar idempotencia y permisos
   - Si canCreatePRs: false → NO continuar
   - Si canCreatePRs: true → continuar
8. Paso create-prs: crea ramas y PRs en Rubik + AURUM
   - Solo una vez por lead
   - Idempotente: si ya existen, actualiza archivos
9. Revision humana del diff en GitHub
10. Merge manual si todo correcto
```

---

## Paso 3 — Enriquecimiento de datos (OBLIGATORIO desde v0.4.3)

Antes del pr-plan final, el operador debe confirmar desde la web oficial del lead:

- Email de contacto
- Telefono principal
- Direccion
- Tagline / propuesta de valor
- Zona geografica

Ver: [07-protocolo-enriquecimiento-leads.md](./07-protocolo-enriquecimiento-leads.md)

**Regla:** Si existe web oficial, `url_pendiente_confirmar` NO es aceptable en ningun campo del Production Package.

---

## Seguridad

- Todos los POSTs de produccion requieren `INTERNAL_API_TOKEN`
- Todos los `/api/operator/*` estan exentos del token gate (protegidos por sesion + CSRF)
- `GITHUB_PR_AUTOMATION_ENABLED` actua como kill switch
- `github-preflight` siempre antes de `create-prs`
- Merge siempre manual, nunca automatico

---

## Repos involucrados

| Repo | Uso |
|---|---|
| `Juanmaes83/Rubik-Sota-Director-de-Orquesta` | Motor visual interno (banners, experiencias) |
| `Juanmaes83/AURUM_PROPERTIES_BOUTIQUE` | Capa publica cliente-facing |
| `Juanmaes83/immersphere-pro-crm-leads` | Panel CRM estatico + backend |

---

## Backend Railway

- URL: https://automation-backend-production-02e5.up.railway.app
- Operator Console: /operator
- Health: /health
- Capabilities: /api/production/capabilities
