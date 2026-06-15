#!/usr/bin/env python
"""
Local Google Maps Scraper Runner for Immersphere Pro CRM.

This tool is intentionally local-only. It does not run inside GitHub Pages,
does not contact leads, does not use proxies, and does not bypass CAPTCHA.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote_plus


ROOT = Path(__file__).resolve().parent
OUTPUTS_DIR = ROOT / "outputs"
CRM_COLUMNS = [
    "businessName",
    "category",
    "vertical",
    "address",
    "city",
    "province",
    "phone",
    "website",
    "googleMapsUrl",
    "rating",
    "reviewCount",
    "openingHours",
    "searchQuery",
    "source",
    "scrapedAt",
    "categoryMatch",
    "relevanceScore",
    "relevanceReasons",
]
RESPONSIBLE_WARNING = (
    "Uso responsable: herramienta local B2B. No scraping masivo, no particulares, "
    "no proxies, no bypass CAPTCHA, no contacto automatico. Si Google muestra CAPTCHA "
    "o bloqueo, detener y revisar manualmente."
)


@dataclass
class SearchPlan:
    query: str
    vertical: str = ""
    city: str = ""
    province: str = ""
    area: str = ""
    limit: int = 5
    source: str = "google_maps_scraper"
    priority: str = "B"
    status: str = "Pendiente"
    id: str = ""
    expand_queries: bool = False


@dataclass
class Result:
    businessName: str = ""
    category: str = ""
    vertical: str = ""
    address: str = ""
    city: str = ""
    province: str = ""
    phone: str = ""
    website: str = ""
    googleMapsUrl: str = ""
    rating: Any = ""
    reviewCount: Any = ""
    openingHours: str = ""
    searchQuery: str = ""
    source: str = "google_maps_scraper"
    scrapedAt: str = ""
    categoryMatch: bool = False
    relevanceScore: int = 0
    relevanceReasons: str = ""


@dataclass
class ScrapeOutcome:
    results: list[Result]
    total_raw_found: int
    total_after_dedupe: int
    query_variants_used: list[str]
    low_relevance_count: int


def slug(value: str) -> str:
    text = (value or "").lower()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ñ": "n",
        "ü": "u",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_") or "busqueda"


def plain_text(value: str) -> str:
    text = (value or "").lower()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ñ": "n",
        "ü": "u",
        "Ã¡": "a",
        "Ã©": "e",
        "Ã­": "i",
        "Ã³": "o",
        "Ãº": "u",
        "Ã±": "n",
        "Ã¼": "u",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return re.sub(r"\s+", " ", text).strip()


def canonical_url(value: str) -> str:
    text = plain_text(value).replace("https://", "").replace("http://", "")
    return text.replace("www.", "").rstrip("/")


def canonical_phone(value: str) -> str:
    return re.sub(r"\D+", "", value or "")


def generate_query_variants(plan: SearchPlan) -> list[str]:
    city = (plan.city or plan.area or plan.province or "").strip()
    base_query = plan.query.strip()
    variants = [base_query]
    vertical = plain_text(plan.vertical)
    if plan.expand_queries and city:
        if "inmobili" in vertical or "real estate" in vertical:
            variants.extend(
                [
                    f"inmobiliaria {city}",
                    f"inmobiliarias {city}",
                    f"agencia inmobiliaria {city}",
                    f"real estate {city}",
                    f"estate agents {city}",
                    f"luxury real estate {city}",
                    f"inmobiliaria lujo {city}",
                    f"propiedades {city}",
                ]
            )
        elif "administradores" in vertical or "fincas" in vertical:
            variants.extend(
                [
                    f"administradores de fincas {city}",
                    f"administracion de fincas {city}",
                    f"administrador de comunidades {city}",
                    f"property management {city}",
                ]
            )
        elif "reforma" in vertical:
            variants.extend([f"empresas de reformas {city}", f"reformas integrales {city}", f"constructora reformas {city}"])
        elif "piscina" in vertical:
            variants.extend([f"empresas de piscinas {city}", f"construccion piscinas {city}", f"piscinas {city}"])
        elif plan.vertical:
            variants.append(f"{plan.vertical} {city}")
    unique: list[str] = []
    seen: set[str] = set()
    for item in variants:
        key = plain_text(item)
        if item and key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def relevance_for_result(result: Result, plan: SearchPlan) -> tuple[bool, int, list[str]]:
    haystack = plain_text(" ".join([result.businessName, result.category, result.address, result.website]))
    reasons: list[str] = []
    score = 0
    vertical = plain_text(plan.vertical)
    if "inmobili" in vertical or "real estate" in vertical:
        positive = ["inmobiliaria", "agencia inmobiliaria", "real estate", "estate agent", "property", "propiedades", "luxury real estate"]
        negative = ["abogado", "lawyer", "restaurante", "restaurant", "hotel", "dentista", "clinica", "bar "]
        if any(term in haystack for term in positive):
            score += 70
            reasons.append("categoría/texto inmobiliario")
        if any(term in plain_text(plan.query) for term in ["premium", "lujo", "luxury"]):
            score += 10
            reasons.append("query premium/lujo")
        if any(term in haystack for term in negative):
            score -= 45
            reasons.append("posible categoría no relacionada")
    else:
        if plain_text(plan.vertical) and plain_text(plan.vertical).split(" ")[0] in haystack:
            score += 60
            reasons.append("vertical aparece en ficha")
        if result.category:
            score += 15
            reasons.append("tiene categoría")
    if result.website:
        score += 10
        reasons.append("tiene web")
    if result.phone:
        score += 10
        reasons.append("tiene teléfono")
    score = max(0, min(100, score))
    match = score >= 55
    if not reasons:
        reasons.append("sin señales claras de encaje")
    return match, score, reasons


def dedupe_key(result: Result) -> str:
    if result.googleMapsUrl:
        return "maps:" + canonical_url(result.googleMapsUrl)
    if result.website:
        return "web:" + canonical_url(result.website)
    phone = canonical_phone(result.phone)
    if len(phone) >= 7:
        return "phone:" + phone
    return "namecity:" + slug(result.businessName + " " + result.city)


def dedupe_results(results: list[Result]) -> list[Result]:
    seen: set[str] = set()
    out: list[Result] = []
    for result in results:
        key = dedupe_key(result)
        if key in seen:
            continue
        seen.add(key)
        out.append(result)
    return out


def clamp_limit(value: int | None) -> int:
    limit = int(value or 5)
    if limit < 1:
        return 1
    if limit > 30:
        raise SystemExit("Por seguridad, el limite maximo recomendado es 30. Reduce --limit.")
    return limit


def output_base(plan: SearchPlan) -> Path:
    date = datetime.now().strftime("%Y-%m-%d")
    name = f"{slug(plan.vertical or plan.query)}_{slug(plan.city or plan.area or plan.province or 'zona')}_{date}"
    return OUTPUTS_DIR / name


def load_plans(path: Path) -> list[SearchPlan]:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    raw_items = data if isinstance(data, list) else data.get("busquedas") or data.get("searchPlans") or []
    plans: list[SearchPlan] = []
    for raw in raw_items:
        if not isinstance(raw, dict) or not raw.get("query"):
            continue
        plans.append(
            SearchPlan(
                id=str(raw.get("id") or ""),
                query=str(raw.get("query") or "").strip(),
                vertical=str(raw.get("vertical") or "").strip(),
                city=str(raw.get("city") or raw.get("ciudad") or "").strip(),
                province=str(raw.get("province") or raw.get("provincia") or "").strip(),
                area=str(raw.get("area") or raw.get("zona") or "").strip(),
                limit=int(raw.get("limit") or raw.get("limite") or 5),
                source="google_maps_scraper",
                priority=str(raw.get("priority") or raw.get("prioridad") or "B").strip(),
                status=str(raw.get("status") or raw.get("estado") or "Pendiente").strip(),
            )
        )
    return plans


def plans_from_args(args: argparse.Namespace) -> list[SearchPlan]:
    limit = clamp_limit(args.limit)
    if args.input:
        plans = load_plans(Path(args.input))
        if args.only:
            needle = args.only.lower().strip()
            plans = [p for p in plans if needle in p.query.lower() or needle == p.id.lower()]
        elif args.all_pending:
            plans = [p for p in plans if (p.status or "Pendiente").lower() == "pendiente"]
        else:
            raise SystemExit("Con --input debes usar --only o --all-pending explicitamente.")
        for plan in plans:
            plan.limit = limit
            plan.expand_queries = bool(args.expand_queries)
        return plans
    if not args.query:
        raise SystemExit("Falta --query o --input.")
    return [
        SearchPlan(
            query=args.query.strip(),
            vertical=(args.vertical or "").strip(),
            city=(args.city or "").strip(),
            province=(args.province or "").strip(),
            area=(args.area or "").strip(),
            limit=limit,
            source="google_maps_scraper",
            priority=args.priority or "B",
            expand_queries=bool(args.expand_queries),
        )
    ]


def print_dry_run(plans: Iterable[SearchPlan]) -> None:
    print(RESPONSIBLE_WARNING)
    print("DRY RUN: no se abre navegador y no se scrapea.")
    for plan in plans:
        base = output_base(plan)
        print("")
        print(f"query: {plan.query}")
        print(f"vertical: {plan.vertical}")
        print(f"ciudad: {plan.city}")
        print(f"provincia: {plan.province}")
        print(f"limite: {plan.limit}")
        print(f"fuente: google_maps_scraper")
        print(f"expand_queries: {plan.expand_queries}")
        print(f"variantes: {', '.join(generate_query_variants(plan))}")
        print(f"csv estimado: {base.with_suffix('.csv')}")
        print(f"json estimado: {base.with_suffix('.json')}")


def require_confirmation(args: argparse.Namespace, plans: list[SearchPlan]) -> None:
    if args.dry_run or args.yes:
        return
    print(RESPONSIBLE_WARNING)
    print(f"Se van a ejecutar {len(plans)} busqueda(s) reales con limite bajo.")
    answer = input("Escribe YES para continuar: ").strip()
    if answer != "YES":
        raise SystemExit("Cancelado por el usuario.")


def parse_int(text: str) -> Any:
    cleaned = re.sub(r"[^\d]", "", text or "")
    return int(cleaned) if cleaned else ""


def parse_float(text: str) -> Any:
    cleaned = (text or "").replace(",", ".")
    match = re.search(r"\d+(?:\.\d+)?", cleaned)
    return float(match.group(0)) if match else ""


def locator_text(page: Any, selector: str, timeout: int = 800) -> str:
    try:
        loc = page.locator(selector).first
        if loc.count() > 0:
            return loc.inner_text(timeout=timeout).strip()
    except Exception:
        return ""
    return ""


def detect_blocking(page: Any) -> None:
    try:
        body = page.locator("body").inner_text(timeout=1000).lower()
    except Exception:
        return
    blocked_terms = ["captcha", "unusual traffic", "trafico inusual", "verify you are not a robot"]
    if any(term in body for term in blocked_terms):
        raise RuntimeError("Google muestra CAPTCHA o bloqueo. Deteniendo sin intentar evadir.")


def accept_google_consent_if_present(page: Any) -> None:
    labels = [
        "Accept all",
        "Aceptar todo",
        "Acepto",
        "Rechazar todo",
    ]
    for label in labels:
        try:
            btn = page.get_by_role("button", name=re.compile(label, re.I)).first
            if btn.count() > 0:
                btn.click(timeout=1500)
                page.wait_for_timeout(1200)
                return
        except Exception:
            continue


def extract_place(page: Any, plan: SearchPlan) -> Result:
    now = datetime.now().isoformat(timespec="seconds")
    current_url = page.url if "google.com/maps" in page.url else ""
    name = locator_text(page, 'h1[class*="DUwDvf"], h1')
    category = locator_text(page, 'button[jsaction*="pane.rating.category"], button[class*="DkEaL"]')
    address = locator_text(page, 'button[data-item-id="address"] div[class*="fontBodyMedium"]')
    website = locator_text(page, 'a[data-item-id="authority"] div[class*="fontBodyMedium"]')
    phone = locator_text(page, 'button[data-item-id^="phone:tel:"] div[class*="fontBodyMedium"]')
    opening = locator_text(page, 'button[data-item-id*="oh"] div[class*="fontBodyMedium"]')
    rating_text = locator_text(page, 'div[class*="F7nice"] span[aria-hidden="true"]')
    reviews_text = locator_text(page, 'div[class*="F7nice"] span[aria-label]')
    result = Result(
        businessName=name,
        category=category,
        vertical=plan.vertical,
        address=address,
        city=plan.city or plan.area,
        province=plan.province,
        phone=phone,
        website=website,
        googleMapsUrl=current_url,
        rating=parse_float(rating_text),
        reviewCount=parse_int(reviews_text),
        openingHours=opening,
        searchQuery=plan.query,
        source="google_maps_scraper",
        scrapedAt=now,
    )
    match, score, reasons = relevance_for_result(result, plan)
    result.categoryMatch = match
    result.relevanceScore = score
    result.relevanceReasons = " | ".join(reasons)
    return result


def collect_listing_hrefs(page: Any, plan: SearchPlan, delay: float, max_scrolls: int = 18) -> tuple[list[str], int]:
    listing_selector = 'a[href*="https://www.google.com/maps/place"]'
    hrefs: list[str] = []
    previous_count = -1
    stable_rounds = 0
    for _ in range(max_scrolls):
        detect_blocking(page)
        links = page.locator(listing_selector).all()
        for link in links:
            href = link.get_attribute("href") or ""
            if href and href not in hrefs:
                hrefs.append(href)
        if len(hrefs) >= plan.limit:
            break
        current_count = len(hrefs)
        if current_count == previous_count:
            stable_rounds += 1
        else:
            stable_rounds = 0
        if stable_rounds >= 3:
            break
        previous_count = current_count
        try:
            feed = page.locator('div[role="feed"]').first
            if feed.count() > 0:
                feed.evaluate("(el) => { el.scrollTop = el.scrollHeight; }")
            else:
                page.mouse.wheel(0, 7000)
        except Exception:
            page.mouse.wheel(0, 7000)
        page.wait_for_timeout(int(delay * 1000))
    return hrefs[: plan.limit], len(hrefs)


def scrape_single_query(plan: SearchPlan, query: str, delay: float, headless: bool) -> tuple[list[Result], int]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit("Playwright no esta instalado. Ejecuta: pip install -r tools/google-maps-scraper/requirements.txt") from exc

    results: list[Result] = []
    raw_found = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        page = browser.new_page()
        try:
            url = f"https://www.google.com/maps/search/{quote_plus(query)}"
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2500)
            accept_google_consent_if_present(page)
            detect_blocking(page)
            hrefs, raw_found = collect_listing_hrefs(page, plan, delay)
            if not hrefs:
                print("Aviso: no se encontraron listings. Puede deberse a consentimiento, bloqueo, DOM cambiado o carga incompleta.")
            for idx, href in enumerate(hrefs, start=1):
                print(f"[{idx}/{len(hrefs)}] {href}")
                page.goto(href, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(int(delay * 1000))
                detect_blocking(page)
                item = extract_place(page, plan)
                if item.businessName:
                    item.searchQuery = query
                    results.append(item)
        finally:
            browser.close()
    return results, raw_found


def scrape_plan(plan: SearchPlan, delay: float, headless: bool) -> ScrapeOutcome:
    variants = generate_query_variants(plan)
    combined: list[Result] = []
    raw_total = 0
    used_variants: list[str] = []
    for query in variants:
        if len(dedupe_results(combined)) >= plan.limit:
            break
        remaining = max(1, plan.limit - len(dedupe_results(combined)))
        query_plan = SearchPlan(**{**asdict(plan), "query": query, "limit": remaining})
        print(f"Query variant: {query} (remaining {remaining})")
        used_variants.append(query)
        results, raw_found = scrape_single_query(query_plan, query, delay, headless)
        raw_total += raw_found
        combined.extend(results)
        time.sleep(max(0.5, delay))
    deduped = dedupe_results(combined)[: plan.limit]
    low_relevance = sum(1 for item in deduped if not item.categoryMatch)
    return ScrapeOutcome(
        results=deduped,
        total_raw_found=raw_total,
        total_after_dedupe=len(deduped),
        query_variants_used=used_variants,
        low_relevance_count=low_relevance,
    )


def write_outputs(plan: SearchPlan, results: list[Result]) -> tuple[Path, Path]:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    base = output_base(plan)
    csv_path = base.with_suffix(".csv")
    json_path = base.with_suffix(".json")
    rows = []
    for result in results:
        row = asdict(result)
        if isinstance(row.get("relevanceReasons"), list):
            row["relevanceReasons"] = " | ".join(row["relevanceReasons"])
        rows.append({col: row.get(col, "") for col in CRM_COLUMNS})
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CRM_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return csv_path, json_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Local Google Maps Scraper Runner for Immersphere CRM")
    parser.add_argument("--query", help="Busqueda individual para Google Maps")
    parser.add_argument("--vertical", default="", help="Vertical CRM")
    parser.add_argument("--city", default="", help="Ciudad")
    parser.add_argument("--province", default="", help="Provincia")
    parser.add_argument("--area", default="", help="Zona o comarca")
    parser.add_argument("--priority", default="B", help="Prioridad CRM A/B/C")
    parser.add_argument("--limit", type=int, default=10, help="Limite bajo de resultados, maximo 30")
    parser.add_argument("--input", help="JSON exportado desde el Buscador del CRM")
    parser.add_argument("--only", help="Ejecutar solo una busqueda por id o texto contenido en query")
    parser.add_argument("--all-pending", action="store_true", help="Ejecutar todas las busquedas pendientes del JSON")
    parser.add_argument("--dry-run", action="store_true", help="Mostrar plan sin abrir navegador ni scrapear")
    parser.add_argument("--yes", action="store_true", help="Confirmar ejecucion real sin prompt interactivo")
    parser.add_argument("--delay", type=float, default=1.8, help="Delay entre acciones en segundos")
    parser.add_argument("--headless", action="store_true", help="Ejecutar navegador sin ventana visible")
    parser.add_argument("--expand-queries", action="store_true", help="Ampliar busqueda con variantes controladas por vertical")
    args = parser.parse_args()

    plans = plans_from_args(args)
    if not plans:
        raise SystemExit("No hay busquedas para ejecutar.")
    if args.dry_run:
        print_dry_run(plans)
        return 0
    require_confirmation(args, plans)
    for plan in plans:
        print(f"Ejecutando: {plan.query} (limite {plan.limit})")
        outcome = scrape_plan(plan, delay=args.delay, headless=args.headless)
        csv_path, json_path = write_outputs(plan, outcome.results)
        print(f"Resultados: {len(outcome.results)}")
        print(f"Encontrados brutos: {outcome.total_raw_found}")
        print(f"Tras dedupe: {outcome.total_after_dedupe}")
        print(f"Baja relevancia: {outcome.low_relevance_count}")
        print(f"Variantes usadas: {', '.join(outcome.query_variants_used)}")
        print(f"CSV: {csv_path}")
        print(f"JSON: {json_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Cancelado por el usuario.", file=sys.stderr)
        raise SystemExit(130)
