# Immersphere Pro CRM Leads

App CRM standalone para captación, seguimiento y cierre comercial de leads de **Immersphere Pro / Rubik SOTA**. Enfocada en inmobiliarias, promotoras, decoración, arquitectura, museos y empresas locales.

🔗 **[Abrir App](https://Juanmaes83.github.io/immersphere-pro-crm-leads/)**

---

## Secciones

- Dashboard comercial
- Leads
- Journey visual
- Pipeline
- Top 10
- Plantillas comerciales
- Ficha completa de lead
- Generador de oferta v0
- Document Hub preparado
- Export / Import
- Reset demo

---

## Funciones implementadas

- 50 leads base
- Crear lead
- Editar lead
- Estados comerciales
- Temperatura del lead
- Next Best Action
- Notas internas
- Historial de actividad
- Próxima acción y fecha
- Filtros rápidos: Hoy, Vencidas, Calientes, Propuesta, Sin próxima acción
- Valor potencial
- Probabilidad de cierre
- Pipeline ponderado
- Plantillas WhatsApp / email / objeciones / cierres
- Personalización de plantillas con placeholders
- Plantillas conectadas al lead activo
- Generador de ofertas con promos base
- Guardar oferta en historial
- Export JSON
- Import JSON
- Export CSV
- Reset demo con doble confirmación
- Botones WhatsApp, email, llamada, web y Maps
- Flujo Room Designer / Decor Asset Lab para importar propuestas visuales como leads comerciales

---

## Fase 5B.1 — Propuestas visuales desde Room Designer

El CRM queda preparado para recibir oportunidades comerciales generadas desde **Room Designer / Decor Asset Lab**.

Flujo:

1. Abrir Room Designer desde el CRM.
2. Crear o revisar una propuesta visual.
3. Exportar proposal JSON desde Room Designer.
4. Pegar el JSON en la vista **Propuestas visuales**.
5. Crear un lead local con estado **Propuesta visual solicitada**.

El lead importado conserva proyecto, cliente, email, telefono, estancia, plantilla, estilo, productos, presupuesto estimado si existe y productos pendientes de valoracion. Se guarda en `localStorage` como lead personalizado y puede gestionarse con el pipeline, ficha de lead, WhatsApp/email y acciones comerciales existentes.

Limitaciones:

- No hay backend.
- No hay API.
- No se envian emails ni WhatsApp automaticamente.
- La importacion es manual mediante JSON pegado.
- La sincronizacion entre dispositivos queda pendiente para una futura migracion al SaaS principal.

URL Room Designer:
`https://immersphere-asset-lab.vercel.app/scenes/room-designer/index.html?source=crm`

---

## ⚠ Aviso de privacidad

Esta app puede contener datos comerciales reales. Si el repositorio contiene emails, teléfonos, direcciones o estrategia comercial, debe ser privado. Para demo pública se recomienda crear una versión sanitizada con datos ficticios.

---

## Limitaciones actuales

- Sin backend
- Sin login real
- Sin sincronización entre dispositivos
- Sin envío automático real de WhatsApp/email
- Sin generación PDF todavía
- Sin contratos/facturas reales
- Sin integración Google Drive / Holded / asesoría todavía

---

## Roadmap siguiente

- Document Hub real
- Propuestas PDF
- Contratos
- Facturas mediante integración externa
- Carpetas cliente
- Envío a asesoría
- Migración futura al SaaS principal con backend, auth y base de datos

---

## Stack

HTML + CSS + JavaScript vanilla. Sin dependencias. Persistencia local con `localStorage`. Despliegue en GitHub Pages.

---

*Immersphere Pro · Rubik SOTA · Uso interno*
