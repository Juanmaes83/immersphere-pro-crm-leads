# Local Google Maps Scraper Runner

Herramienta local para convertir busquedas planificadas en el CRM en CSV/JSON importables. No se ejecuta en GitHub Pages, no contacta leads y no automatiza outreach.

## Instalacion

Desde la raiz del repo:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r tools/google-maps-scraper/requirements.txt
python -m playwright install chromium
```

## Dry-run obligatorio recomendado

```bash
python tools/google-maps-scraper/run.py --query "administradores de fincas torrevieja" --vertical "Administradores de fincas" --city "Torrevieja" --province "Alicante" --limit 5 --dry-run
```

El dry-run no abre navegador ni scrapea. Muestra query, limite, salida esperada y aviso de uso responsable.

## Ejecucion real local

```bash
python tools/google-maps-scraper/run.py --query "administradores de fincas torrevieja" --vertical "Administradores de fincas" --city "Torrevieja" --province "Alicante" --limit 5 --yes
```

Para mejorar cobertura con variantes controladas:

```bash
python tools/google-maps-scraper/run.py --query "inmobiliarias premium Altea" --vertical "Inmobiliarias" --city "Altea" --province "Alicante" --limit 20 --expand-queries --yes
```

## Local Scraper Bridge

Para ejecutar busquedas desde la interfaz local del CRM, arranca el servidor:

```bash
python tools/google-maps-scraper/server.py
```

Queda escuchando solo en:

```text
http://127.0.0.1:8765
```

Endpoints:

- `GET /health`: comprueba si el scraper local esta activo.
- `POST /run`: ejecuta una busqueda o dry-run y devuelve JSON normalizado.
- `POST /audit-website`: audita de forma local y controlada la web publica de un lead. Fase 3.1 normaliza la URL, revisa siempre la home/base del dominio, incluye la URL interna recibida si es segura y selecciona paginas clave del mismo dominio: contacto, portfolio/proyectos, servicios/showroom/catalogo y propiedades solo si aplica. Maximo 4 URLs por lead. No envia formularios, no hace login, no ejecuta Lighthouse y no captura screenshots.
- `GET /outputs`: lista CSV/JSON generados.

Ejemplo de payload:

```json
{
  "query": "inmobiliarias premium Altea",
  "vertical": "Inmobiliarias",
  "city": "Altea",
  "province": "Alicante",
  "limit": 5,
  "source": "google_maps_scraper",
  "searchPlanId": "search_123",
  "expandQueries": true
}
```

Dry-run por API:

```json
{
  "query": "inmobiliarias premium Altea",
  "vertical": "Inmobiliarias",
  "city": "Altea",
  "province": "Alicante",
  "limit": 5,
  "dryRun": true
}
```

El servidor incluye CORS para `file://`, `localhost`, `127.0.0.1` y GitHub Pages. Algunos navegadores pueden bloquear llamadas desde una pagina HTTPS publica a `localhost`; si ocurre, abre `index.html` localmente o sirve el CRM en `localhost`.

Desde JSON exportado por el CRM:

```bash
python tools/google-maps-scraper/run.py --input data/search-plans.json --only "administradores de fincas torrevieja" --limit 5 --dry-run
```

Para todas las pendientes hay que pedirlo explicitamente:

```bash
python tools/google-maps-scraper/run.py --input data/search-plans.json --all-pending --limit 5 --yes
```

## Salidas

Los resultados se guardan en:

```text
tools/google-maps-scraper/outputs/
```

Formatos:

- CSV compatible con el importador del CRM.
- JSON con el mismo modelo normalizado.

Columnas:

```text
businessName,category,vertical,address,city,province,phone,website,googleMapsUrl,rating,reviewCount,openingHours,searchQuery,source,scrapedAt,categoryMatch,relevanceScore,relevanceReasons
```

`categoryMatch`, `relevanceScore` y `relevanceReasons` ayudan a revisar ruido. Para inmobiliarias se consideran señales positivas textos como `inmobiliaria`, `agencia inmobiliaria`, `real estate`, `estate agent`, `property`, `propiedades` y `luxury real estate`. Los resultados no relacionados se marcan como baja relevancia, no se eliminan automaticamente.

## Controles

- Limite por defecto: 10.
- Maximo permitido por seguridad: 30.
- Confirmacion interactiva salvo `--yes`.
- `--all-pending` obligatorio para ejecutar todas las pendientes.
- Sin proxies.
- Sin bypass CAPTCHA.
- Si aparece CAPTCHA o bloqueo, se detiene.

## Uso responsable

Usar solo para prospeccion B2B interna, bajo volumen, revision humana y cumplimiento de RGPD/LSSI y condiciones de la fuente. No contactar particulares ni automatizar mensajes.
