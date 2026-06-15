# Importacion CSV para New Business Engine

Este CRM no hace scraping, no envia mensajes automaticos y no enriquece datos por su cuenta. La importacion espera un CSV preparado externamente y revisado antes de usarlo comercialmente.

## Columnas recomendadas

El importador es tolerante con nombres de columnas, pero este formato es el mas limpio:

```csv
businessName,category,address,city,province,phone,website,googleMapsUrl,rating,reviewCount,searchQuery,source,scrapedAt
```

Tambien acepta variantes habituales como `name`, `empresa`, `tipo`, `phoneNumber`, `url`, `mapsUrl`, `reviews` o `query`.

## Flujo recomendado

1. Exportar o preparar el CSV fuera del CRM.
2. Revisar que los negocios sean B2B relevantes para Immersphere Pro.
3. Importar en la pestaña `Importar`.
4. Usar `Previsualizar` para comprobar scoring, vertical y posibles duplicados.
5. Importar solo si los datos son razonables.
6. Validar manualmente el decisor y el contexto antes de contactar.

## Desde el scraper local

Si el CSV viene de `tools/google-maps-scraper`, selecciona antes la busqueda asociada en la pestaña `Importar`. Si faltan campos en el CSV, el CRM hereda `vertical`, `city`, `province`, `source`, `searchQuery` y `searchPlanId` desde esa busqueda.

## Uso responsable

- No usar el CRM para spam ni contacto masivo.
- No contactar negocios sin interes legitimo o contexto comercial claro.
- No tratar el rating o las resenas como datos definitivos; son senales para priorizar.
- Usar WhatsApp, email y llamadas como acciones manuales y personalizadas.
- Hacer backup JSON antes de importaciones grandes.
