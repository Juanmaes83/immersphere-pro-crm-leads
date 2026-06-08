# AGENTS.md — Immersphere Pro CRM Comercial

## Proyecto

Immersphere Pro CRM Comercial es una aplicación standalone en HTML + JavaScript vanilla.

Archivos principales:
- `crm.html`
- `index.html`

Ambos archivos deben mantenerse sincronizados siempre.

## Estado actual del CRM

El CRM incluye:
- Dashboard comercial
- Leads
- Journey
- Top 10
- Pipeline
- Plantillas
- Catálogo / Tarifario
- Integraciones
- Presupuestos
- Propuestas
- Propuestas visuales desde Room Designer / Decor Asset Lab
- Gestión administrativa
- Seguimiento / fidelización
- Import / Export JSON
- Catálogo editable de servicios
- Catálogo editable de packs
- Agente Comercial IA asistido

## Stack técnico

- HTML standalone
- CSS inline en el mismo archivo
- JavaScript vanilla
- Persistencia en `localStorage`
- Sin backend
- Sin APIs externas
- Sin dependencias npm
- Sin build step

## Reglas críticas

1. No romper `crm.html`.
2. No romper `index.html`.
3. Todo cambio en `crm.html` debe replicarse en `index.html`.
4. No hacer commit sin aprobación explícita.
5. No añadir backend, APIs ni dependencias sin autorización.
6. No guardar API keys, secretos ni credenciales en el código.
7. No eliminar funciones existentes sin revisar su uso.
8. No modificar import/export JSON sin probar compatibilidad.
9. No tocar datos comerciales reales salvo que se pida expresamente.
10. No automatizar envíos de WhatsApp/email sin revisión humana.

## Persistencia

El CRM guarda datos en `localStorage`.

Claves relevantes:
- Estado de leads
- Leads personalizados
- Integraciones
- Catálogo personalizado
- Servicios editados
- Packs editados

Cualquier nueva funcionalidad que deba sobrevivir a recarga debe usar `localStorage`.

## Catálogo / Tarifario

El catálogo usa:
- `SERVICES_CATALOG`
- `PACKS_CATALOG`

Funciones actuales:
- Crear servicio
- Editar servicio
- Duplicar servicio
- Crear pack
- Editar pack
- Duplicar pack
- Guardar catálogo personalizado
- Restaurar demo

Regla:
Si se modifica catálogo, comprobar que sigue funcionando en presupuestos y propuestas.

## Import / Export JSON

El importador debe:
- actualizar leads existentes;
- añadir leads nuevos como leads personalizados;
- guardar correctamente en `localStorage`;
- sobrevivir a recarga.

No volver al patrón antiguo que solo recorría leads existentes.

## Room Designer / Decor Asset Lab

El flujo Room Designer es manual y sin backend:
- abrir Room Designer desde el CRM;
- exportar proposal JSON;
- pegar JSON en la vista `Propuestas visuales`;
- crear lead personalizado en `localStorage`;
- gestionarlo con estado `Propuesta visual solicitada`.

No automatizar envíos ni crear APIs en esta fase. Los leads visuales deben conservar compatibilidad con pipeline, ficha de lead, WhatsApp/email preparados y export/import general del CRM.

## Agente Comercial IA

El Agente Comercial IA es asistido, no autónomo.

Puede:
- seleccionar Top 10 leads del día;
- sugerir canal;
- sugerir objetivo;
- generar WhatsApp;
- generar email;
- sugerir valor potencial;
- sugerir probabilidad;
- copiar agenda comercial.

No puede:
- enviar mensajes automáticamente;
- conectar APIs;
- escribir a terceros;
- modificar leads sin confirmación;
- prometer resultados comerciales.

## Flujo recomendado para tareas con Codex

Antes de modificar:
1. Leer este archivo.
2. Revisar `git status --short`.
3. Localizar funciones existentes.
4. Explicar plan breve.
5. Modificar solo lo necesario.

Después de modificar:
1. Confirmar que `crm.html` e `index.html` están sincronizados.
2. Ejecutar `git --no-pager diff --check`.
3. Mostrar `git --no-pager diff --shortstat`.
4. Probar visualmente la funcionalidad.
5. No hacer commit sin aprobación.

## Comandos útiles

Comprobar estado:
`git status --short`

Comprobar errores de diff:
`git --no-pager diff --check`

Resumen de cambios:
`git --no-pager diff --shortstat`

Comparar archivos:
`Compare-Object (Get-Content .\crm.html) (Get-Content .\index.html) | Select-Object -First 5`

## Criterio de calidad

Cada mejora debe ser:
- pequeña;
- reversible;
- comprobable;
- compatible con localStorage;
- sincronizada en `crm.html` e `index.html`;
- sin dependencias nuevas;
- sin automatización peligrosa.

## Regla final

Este CRM es una herramienta comercial operativa. Priorizar estabilidad, captación y seguimiento real sobre features complejas.
