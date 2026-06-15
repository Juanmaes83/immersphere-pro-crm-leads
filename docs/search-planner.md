# Buscador de oportunidades

El Buscador de oportunidades es un planificador interno de prospeccion B2B. No ejecuta scraping, no abre Google Maps y no automatiza mensajes.

## Flujo recomendado

1. Crear una busqueda en la pestaña `Buscador`.
2. Revisar la query generada y editarla si hace falta.
3. Ejecutar esa query manualmente en el repo externo Google-Maps-Scrapper o en la herramienta aprobada.
4. Exportar el resultado a CSV.
5. Volver al CRM, ir a `Importar` y seleccionar la busqueda asociada.
6. Cargar el CSV, previsualizar e importar.
7. Revisar scoring, prioridad, pitch y pipeline.

## Campos de busqueda

- vertical
- ciudad
- provincia
- zona o comarca
- palabras clave
- radio o ambito
- limite de resultados
- fuente sugerida
- prioridad
- notas

## Conexion con importacion

Si el CSV no trae vertical, ciudad, provincia, source o searchQuery, el CRM hereda esos datos desde la busqueda asociada. Al importar, la busqueda queda marcada como `Importada` y se incrementa `importedCount`.

## Uso responsable

- Solo planificar busquedas B2B internas.
- No contactar particulares.
- No hacer scraping masivo agresivo.
- Revisar RGPD/LSSI y condiciones de la fuente.
- Validar los datos antes de contactar.
- Mantener el contacto comercial manual, personalizado y de bajo volumen.

## Scraper local del repo

Esta fase añade una herramienta local en `tools/google-maps-scraper`. La app publica no scrapea. El comando recomendado empieza siempre por dry-run:

```bash
python tools/google-maps-scraper/run.py --query "administradores de fincas torrevieja" --vertical "Administradores de fincas" --city "Torrevieja" --province "Alicante" --limit 5 --dry-run
```

Para ejecutar scraping real local hay que usar `--yes` o confirmar manualmente en terminal. No usar limites altos.

## Ejecutar desde el CRM local

1. Arranca el puente local:

```bash
python tools/google-maps-scraper/server.py
```

2. Abre `index.html` localmente.
3. En `Buscador`, pulsa `Comprobar scraper`.
4. Si aparece conectado, pulsa `Ejecutar busqueda local`.
5. Revisa la previsualizacion.
6. Pulsa `Importar resultados al CRM`.

La importacion directa usa la misma deduplicacion, scoring, prioridad y asociacion `searchPlanId` que el CSV.

## Ampliar busqueda con variantes

Marca `Ampliar busqueda con variantes` cuando una query concreta devuelve pocos resultados. Para inmobiliarias, el scraper puede probar variantes como `inmobiliaria Altea`, `inmobiliarias Altea`, `agencia inmobiliaria Altea`, `real estate Altea`, `estate agents Altea`, `luxury real estate Altea`, `inmobiliaria lujo Altea` y `propiedades Altea`.

Los resultados combinados se deduplican por Google Maps URL, web, telefono o empresa+ciudad. La pantalla marca cada resultado como `Alta relevancia` o `Revisar`.
