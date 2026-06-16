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
- Import CSV para New Business Engine
- Buscador de oportunidades para planificar queries B2B
- Scoring B2B por vertical, zona, contacto, web, rating y oportunidad visual
- Deduplicacion local por web, Google Maps, telefono y nombre/zona
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

## New Business Engine MVP

La vista **Importar** permite pegar o cargar CSV de leads B2B preparados externamente. El CRM normaliza columnas frecuentes de Google Maps/CSV, clasifica verticales, calcula prioridad comercial, propone un pitch manual y guarda los leads importados en `localStorage` sin modificar los 50 leads base.

No hace scraping, no envia WhatsApp/email automaticamente y no sustituye la validacion manual del decisor. Antes de importaciones grandes se recomienda exportar backup JSON.

Guia operativa: `docs/import-google-maps-csv.md`

La vista **Buscador** permite preparar queries B2B para usar despues con el repo externo Google-Maps-Scrapper. Guarda busquedas en `localStorage`, genera nombre CSV sugerido e instrucciones genericas, y permite asociar una busqueda al importar el CSV para heredar vertical, zona, source y query.

Guia del buscador: `docs/search-planner.md`

### Scraper local controlado

El repo incluye una herramienta local en `tools/google-maps-scraper`. No se ejecuta en GitHub Pages y no añade scraping al navegador del CRM.

Dry-run:

```bash
python tools/google-maps-scraper/run.py --query "administradores de fincas torrevieja" --vertical "Administradores de fincas" --city "Torrevieja" --province "Alicante" --limit 5 --dry-run
```

Ejecucion real local, bajo volumen y con confirmacion:

```bash
python tools/google-maps-scraper/run.py --query "administradores de fincas torrevieja" --vertical "Administradores de fincas" --city "Torrevieja" --province "Alicante" --limit 5 --yes
```

El CSV/JSON generado queda en `tools/google-maps-scraper/outputs/` y puede importarse desde la pestaña **Importar**.

Para mejorar cobertura, el Buscador incluye **Ampliar busqueda con variantes**. En inmobiliarias prueba combinaciones como `inmobiliaria`, `agencia inmobiliaria`, `real estate`, `estate agents`, `luxury real estate`, `inmobiliaria lujo` y `propiedades` + ciudad. El scraper deduplica y marca baja relevancia sin borrar resultados.

Servidor local para usarlo desde el CRM abierto en local:

```bash
python tools/google-maps-scraper/server.py
```

Luego en la pestaña **Buscador**: `Comprobar scraper` → `Ejecutar búsqueda local` → `Importar resultados al CRM`.

### Fase 2D - Paridad de fichas importadas

Los leads que entran por CSV o Local Scraper Bridge se crean con el mismo modelo operativo de ficha que los leads seed: scoring 360, prioridad, temperatura, mensajes, propuesta comercial, notas, presupuestos, propuestas, gestion administrativa, journey documental y pipeline visual.

El boton **Completar fichas importadas** rellena campos vacios o placeholders de leads importados incompletos sin sobrescribir notas, historial, presupuestos, propuestas ni estrategia manual.

### Roadmap futuro

- Fase 3 — Website Opportunity Audit: detectar web antigua, no responsive, sin HTTPS, sin CTA, sin WhatsApp, sin formularios claros, sin tour virtual, baja velocidad y mala estructura comercial.
- Fase 4 — Pitch & Proposal Generator: crear problema detectado, oportunidad, propuesta Immersphere, mensaje sugerido y siguiente accion.
- Fase 5 — Outreach Assistant: preparar email, LinkedIn, llamada y WhatsApp manual con revision humana obligatoria, sin envio automatico.

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
