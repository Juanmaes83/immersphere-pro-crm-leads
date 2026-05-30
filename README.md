# Immersphere Pro · CRM Comercial Local

App standalone para captación, seguimiento y cierre de leads comerciales de **Immersphere Pro** y **Rubik SOTA**.
Zona: Torrevieja / Orihuela Costa · 2026.

🔗 **[Abrir App](https://Juanmaes83.github.io/immersphere-pro-crm-leads/)**

---

## ⚠ Advertencia de privacidad

Este repositorio puede contener datos comerciales reales (emails, teléfonos, estrategia de venta). **No usar como repo público con datos reales.** Si necesitas mostrar la app públicamente, crea primero una versión demo con datos ficticios. Para uso interno, mantener el repositorio en privado.

---

## Funcionalidades implementadas

### 📊 Dashboard comercial
- KPIs de pipeline: Sin contactar / Contactado / Propuesta / Cerrado
- KPIs de temperatura: Frío / Templado / Caliente / Muy caliente
- KPIs comerciales: Valor potencial total, Pipeline ponderado (valor × probabilidad), Calientes sin próxima acción, Propuestas pendientes
- Acciones pendientes hoy y follow-ups vencidos
- Top 5 leads por score y distribución por sector

### 🎯 Leads
- 50 leads base + creación ilimitada de leads custom
- Filtros: prioridad (A/B/C), temperatura, estado comercial, búsqueda libre (empresa, sector, zona, responsable, email)
- Filtros rápidos: Hoy / Vencidas / Calientes / Propuesta / Sin próxima acción

### 🗺 Journey del cliente
- 6 fases: Detectado → Validado → Contactado → Propuesta → Cerrado → No interesa
- Cada tarjeta con temperatura, NBA, botones rápidos (WhatsApp / Email / Tel)

### 🌡 Temperatura del lead
- Cálculo automático según estado + responsable + WhatsApp + score + prioridad
- Override manual desde el modal del lead

### ⚡ Next Best Action
- Recomendación contextual por lead según estado, temperatura y próxima fecha

### 📝 Notas, historial y próxima acción
- Notas internas editables por lead
- Próxima acción con fecha (visible en tarjeta + alerta vencida)
- Historial de actividad con 9 tipos: Llamada, WhatsApp, Email, Reunión/Demo, Propuesta, Objeción, Cierre, Visita, Nota
- Persistencia en localStorage

### ✏ Crear y editar leads
- 24 campos editables (empresa, contacto, comercial, oportunidad)
- Campos comerciales: valor potencial (€), probabilidad cierre (%), presupuesto, pack recomendado, fecha último contacto
- Eliminar leads custom con confirmación

### 📋 Biblioteca de plantillas
- 31 plantillas: 8 WhatsApp, 8 Email, 8 Objeciones, 7 Cierres
- Copy-paste + botones WhatsApp test y Email test
- **Personalización automática** con datos del lead: `[NOMBRE]`, `[EMPRESA]`, `[SERVICIO]`, `[PRECIO]`, `[FECHA]`, `[ZONA]`, `[WEB]`, `[OBJECION]`, `[CTA]`
- **Usar plantilla con este lead** desde el modal: selecciona, previsualiza con datos reales, copia o abre directamente en WhatsApp/Email

### 🎯 Generador de ofertas
- Pack, servicio, precio, descuento, bonus, caducidad, objetivo, CTA, notas
- 7 promos base aplicables con un clic: Demo 360 piloto, Tour 360 + QR, Pack Inmobiliaria 360, Pack Propiedad Premium, Pack Video+Landing+Tour, Reactivación, Pack mensual
- Genera automáticamente: mensaje WhatsApp, email completo, texto para llamada, respuesta a objeción de precio
- Botones directos para abrir WhatsApp y Email pre-rellenados
- Guardar oferta en historial del lead → registra actividad + cambia estado a Propuesta + programa follow-up en 48h

### 📄 Document Hub (preparado)
- Estructura visual de propuestas, contratos, facturas, briefings y entregables
- **Implementación pendiente** de generación PDF e integración Drive/Holded

### 🔄 Pipeline Kanban
- 5 columnas con conteo en tiempo real

### 🔥 Top 10
- Ranking visual por score con gancho personalizado

### ⬇⬆ Export / Import
- JSON v1.2 con todos los datos (estados, notas, actividad, edits, comercial, leads custom)
- CSV con 17 columnas incluidos valor potencial, probabilidad y pipeline ponderado
- Import retrocompatible con backups v1.0, v1.1, v1.2

### ↺ Reset demo
- Borra todos los datos guardados con doble confirmación

---

## Stack

- HTML + CSS + JavaScript vanilla
- Sin backend
- Sin base de datos
- Sin dependencias externas
- Datos hardcodeados en JSON, estado persistido en `localStorage`

## Despliegue

GitHub Pages — rama `main`, carpeta raíz.

## Uso

Abre `index.html` en cualquier navegador. No requiere servidor.

---

## Roadmap

- ✅ **Fase 1** — App standalone con 50 leads, filtros, pipeline, plantillas
- ✅ **Fase 2** — CRM operativo: editar/crear leads, notas, historial, próxima acción
- ✅ **Fase 3** — Motor comercial: temperatura, NBA, Journey, plantillas contextuales, generador de ofertas
- 🔜 **Fase 4** — Document Hub: generación PDF de propuestas, contratos, facturas, integración Drive/Holded/asesoría
- 🔜 **Fase 5** — Mobile polish + modo demo sanitizado
- 🔜 **Fase 6** — Integración SaaS Immersphere Pro con auth, Prisma, multiusuario

---

*Immersphere Pro · Rubik SOTA · Uso interno*
