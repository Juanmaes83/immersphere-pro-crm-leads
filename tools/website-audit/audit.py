#!/usr/bin/env python
"""
Controlled website opportunity audit for Immersphere Pro CRM.

Fase 3.1:
- Always audits the domain home, even when the input URL is an internal page.
- Adds at most three extra same-domain key pages.
- Adapts labels, signals, scoring and recommendations by vertical.

Fase 7B-local (Lead Enrichment Connector):
- Adds `audit.enrichmentCandidates`: real contact values (not just booleans),
  asset candidates (favicon/logo/og:image/twitter:image/hero/property/all
  images) and brand signals (headings, claims, internal links, colors).
- Pure HTML/regex parsing only — no JavaScript execution, no Playwright, no
  image downloads, no hotlinking validation. Every candidate is exactly
  that: a candidate. Nothing here is auto-approved; approval stays a CRM
  operator action against mediaAssetsManual, untouched by this file.
- Backward compatible: every field present before this change is unchanged.

Fase 7I-B (deep page discovery + image quality + logo/whatsapp accuracy):
- Page discovery widened from "home + 3" to up to 8 pages, prioritized by
  real-estate/promoter commercial keywords (residencial, promociones,
  obra-nueva, propiedades, villas, listings, venta, torrevieja, costa
  blanca...), with a second pass into listing/promotion pages to find the
  individual property pages they link to. Still static HTML only — no JS,
  no Playwright, no infinite crawl (hard-capped at MAX_PAGES).
- Image discovery widened (srcset, data-src/data-lazy-src/data-original,
  inline background-image, direct .jpg/.png/.webp/.avif links) and
  filtered: icons/sprites/flags/placeholders/plugin assets are dropped into
  a capped discardedImages list instead of polluting allImages.
  propertyImages are now sourced from pages actually classified as
  property/promotion/listing, not just keyword-matched on home.
- Logo detection now also matches the lead's own business name (passed in
  payload.businessName) and explicitly downgrades confidence with a
  warning when src/alt/class matches known template/CMS-provider patterns
  (wordpress, elementor, ego, wix, squarespace, webflow, shopify...).
  Never invents a logo: an empty logos list is a valid, honest result.
- enrichmentCandidates.pageDiscovery.urlsReviewed lists every page visited
  with its commercial pageType, why it was selected, httpStatus, and per-
  page image/contact candidate counts.

No forms, login, proxies, CAPTCHA bypass, Lighthouse, screenshots or deep crawl.
"""

from __future__ import annotations

import html
import re
import ssl
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen


MAX_HTML_CHARS = 750_000
MAX_PAGES = 8
TIMEOUT_SECONDS = 8
USER_AGENT = "ImmersphereProLocalAudit/3.3 (+local controlled B2B audit)"

# Fase 7B-local enrichment caps — keep the payload small and predictable.
MAX_PHONES = 5
MAX_EMAILS = 5
MAX_WHATSAPP_LINKS = 3
MAX_ADDRESSES = 2
MAX_SOCIAL_LINKS = 10
MAX_FAVICONS = 3
MAX_LOGOS = 5
MAX_OG_IMAGES = 2
MAX_TWITTER_IMAGES = 2
MAX_HERO_IMAGES = 5
MAX_PROPERTY_IMAGES = 12
MAX_ALL_IMAGES = 20
MAX_DISCARDED_IMAGES = 20
MAX_HEADINGS = 6
MAX_CLAIMS = 3
MAX_INTERNAL_LINKS = 12
MAX_COLORS = 6

EXCLUDED_PATH_RE = re.compile(
    r"\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|rar|doc|docx|xls|xlsx|ppt|pptx)$|"
    r"wp-admin|login|checkout|cart|carrito|privacy|privacidad|cookies|terms|terminos|aviso-legal|legal",
    re.I,
)
EXTERNAL_RE = re.compile(r"whatsapp|wa\.me|google\.[^/]+/maps|facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com", re.I)

PAGE_PATTERNS = {
    "contact": [
        r"contacto", r"contact", r"contactar", r"pide-cita", r"cita", r"presupuesto",
        r"solicitar-informacion", r"visit", r"appointment",
    ],
    "portfolio": [
        r"proyectos", r"projects", r"portfolio", r"trabajos", r"works", r"obras",
        r"realizaciones", r"casos", r"cases", r"antes-despues", r"before-after",
        r"reformas-realizadas",
    ],
    "services": [
        r"servicios", r"services", r"soluciones", r"interiorismo", r"arquitectura",
        r"reformas", r"diseno", r"diseño", r"catalogo", r"catálogo", r"productos",
        r"showroom", r"tienda",
    ],
    "listings": [
        r"propiedades", r"inmuebles", r"villas", r"venta", r"alquiler", r"obra-nueva",
        r"promociones", r"properties", r"real-estate", r"for-sale", r"homes",
    ],
    # Classification only (Fase 7B-local) — NOT added to select_pages_to_audit's
    # `wanted` lists, so this does not change which pages get fetched/scored.
    # It only lets internal links discovered on the home page be labeled
    # correctly inside enrichmentCandidates.brandSignals.internalLinks.
    "about": [
        r"sobre-nosotros", r"sobre nosotros", r"quienes-somos", r"quienes somos",
        r"about-us", r"about", r"nosotros", r"empresa", r"who-we-are",
    ],
}

# Fase 7I-B: deep page discovery for real-estate/promoter sites. Used only by
# commercial_page_type()/select_pages_to_audit() below — independent from
# PAGE_PATTERNS above, which keeps driving the legacy signals/scoring
# untouched for backward compatibility.
COMMERCIAL_LISTING_KEYWORDS = [
    "residencial", "residenciales", "propiedades", "inmuebles", "villas", "apartamentos",
    "viviendas", "developments", "development", "property", "properties", "real-estate",
    "realestate", "listings", "venta",
]
COMMERCIAL_PROMOTION_KEYWORDS = [
    "promociones", "promocion", "obra-nueva", "obra nueva", "obranueva", "proyectos", "proyecto",
]
COMMERCIAL_LOCATION_KEYWORDS = ["torrevieja", "costa-blanca", "costa blanca", "costablanca"]


def commercial_page_type(url: str, label: str = "") -> str:
    """Classifies a URL into the Fase 7I-B taxonomy used for
    pageDiscovery.urlsReviewed: home/contact/listing/property/promotion/other.
    Independent from the legacy page_type_for_url() used for scoring."""
    if is_home(url):
        return "home"
    target = strip_accents((url + " " + label).lower())
    if re.search(r"contacto|contact|contactar", target):
        return "contact"
    path = urlparse(url).path.strip("/")
    segments = [s for s in path.split("/") if s]
    matched_listing = any(strip_accents(kw.lower()) in target for kw in COMMERCIAL_LISTING_KEYWORDS)
    matched_promotion = any(strip_accents(kw.lower()) in target for kw in COMMERCIAL_PROMOTION_KEYWORDS)
    if (matched_listing or matched_promotion) and len(segments) >= 2:
        return "property"
    if matched_promotion:
        return "promotion"
    if matched_listing:
        return "listing"
    return "other"


def legacy_page_type_for_commercial(kind: str) -> str:
    """Maps the new commercial taxonomy to the legacy page_type values that
    evidence_from_pages()/score_and_recommend() already key off of, so
    scoring/weaknesses/opportunities stay exactly as before for callers that
    don't care about the new granular pageDiscovery output."""
    return {
        "home": "home", "contact": "contact", "listing": "listings",
        "property": "listings", "promotion": "listings", "other": "unknown",
    }.get(kind, "unknown")

PROFILE_LABELS = {
    "real_estate": {
        "primaryAssetLabel": "Propiedades",
        "portfolioLabel": "Tour/360",
        "conversionLabel": "Visita / Contacto",
        "catalogLabel": "Captacion",
        "experienceLabel": "Video",
    },
    "interior_design": {
        "primaryAssetLabel": "Portfolio / Proyectos",
        "portfolioLabel": "Showroom / Catalogo",
        "conversionLabel": "Cita / Presupuesto",
        "catalogLabel": "Tour showroom",
        "experienceLabel": "Video",
    },
    "architecture": {
        "primaryAssetLabel": "Proyectos",
        "portfolioLabel": "Renders / Visuales",
        "conversionLabel": "Consulta",
        "catalogLabel": "Servicios",
        "experienceLabel": "Visualizacion 3D/360",
    },
    "construction": {
        "primaryAssetLabel": "Antes/despues",
        "portfolioLabel": "Obras realizadas",
        "conversionLabel": "Presupuesto",
        "catalogLabel": "Servicios",
        "experienceLabel": "Confianza visual",
    },
    "hospitality": {
        "primaryAssetLabel": "Reservas",
        "portfolioLabel": "Espacios / Habitaciones",
        "conversionLabel": "Menu / Servicios",
        "catalogLabel": "Tour ambiente",
        "experienceLabel": "Experiencia",
    },
    "generic": {
        "primaryAssetLabel": "Portfolio / Casos",
        "portfolioLabel": "Servicios",
        "conversionLabel": "CTA",
        "catalogLabel": "Contacto",
        "experienceLabel": "Experiencia visual",
    },
}


@dataclass
class FetchResult:
    url: str
    final_url: str
    page_type: str
    ok: bool
    status: int
    html: str
    load_time_ms: int
    error: str = ""


def strip_accents(text: str) -> str:
    table = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    return (text or "").translate(table)


def plain_text(value: str) -> str:
    text = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", value or "")
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_url(url: str) -> str:
    value = (url or "").strip()
    if not value:
        return ""
    parsed = urlparse(value if "://" in value else "https://" + value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return ""
    return clean_url(parsed.geturl())


def clean_url(url: str) -> str:
    parsed = urlparse(url)
    keep_params = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=False) if k.lower() in {"p", "page_id"}]
    path = parsed.path or "/"
    return urlunparse((parsed.scheme, parsed.netloc, path, "", urlencode(keep_params), ""))


def home_url(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, "/", "", "", ""))


def absolute_asset_url(base_url: str, raw: str) -> str:
    """Resolve a possibly-relative asset URL against base_url and reject
    anything that isn't a plain http(s) URL. Never returns javascript:,
    data:, file:, mailto:, tel: or empty/garbage values."""
    value = html.unescape((raw or "").strip())
    if not value or value.startswith("#"):
        return ""
    lowered = value.lower()
    if lowered.startswith(("javascript:", "data:", "file:", "mailto:", "tel:")):
        return ""
    try:
        resolved = urljoin(base_url, value)
    except ValueError:
        return ""
    parsed = urlparse(resolved)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return ""
    return resolved


def same_domain(a: str, b: str) -> bool:
    pa, pb = urlparse(a), urlparse(b)
    host_a = pa.netloc.lower().removeprefix("www.")
    host_b = pb.netloc.lower().removeprefix("www.")
    return bool(host_a and host_a == host_b)


def is_home(url: str) -> bool:
    parsed = urlparse(url)
    return (parsed.path or "/") == "/" and not parsed.query


def is_excluded_url(url: str) -> bool:
    return bool(EXCLUDED_PATH_RE.search(url) or EXTERNAL_RE.search(url))


def fetch_page(url: str, page_type: str) -> FetchResult:
    started = time.perf_counter()
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS, context=ssl.create_default_context()) as response:
            content_type = response.headers.get("Content-Type", "")
            raw = response.read(MAX_HTML_CHARS)
            charset = response.headers.get_content_charset() or "utf-8"
            body = raw.decode(charset, errors="replace") if "html" in content_type.lower() or raw else ""
            return FetchResult(url, response.geturl(), page_type, True, int(getattr(response, "status", 200) or 200), body, round((time.perf_counter() - started) * 1000))
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read(MAX_HTML_CHARS).decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return FetchResult(url, exc.geturl() or url, page_type, False, int(exc.code or 0), body, round((time.perf_counter() - started) * 1000), str(exc))
    except (TimeoutError, URLError, OSError) as exc:
        return FetchResult(url, url, page_type, False, 0, "", round((time.perf_counter() - started) * 1000), str(exc))


def first_match(pattern: str, text: str, flags: int = re.I | re.S) -> str:
    match = re.search(pattern, text or "", flags)
    return html.unescape(match.group(1)).strip() if match else ""


def vertical_profile(vertical: str, business_name: str = "", text: str = "") -> str:
    value = strip_accents(" ".join([vertical, business_name, text])).lower()
    if re.search(r"inmobili|real estate|property|propiedades|villas|alquiler|venta|obra nueva|promociones", value):
        return "real_estate"
    if re.search(r"interiorismo|muebles|decoracion|showroom|cocinas|diseno interior|reformas interiores|mobiliario", value):
        return "interior_design"
    if re.search(r"arquitect|arquitecto|estudio|ingenieria|diseno arquitectonico|renders|planos", value):
        return "architecture"
    if re.search(r"reformas|construccion|obra|rehabilitacion|albanileria|mantenimiento|antes y despues", value):
        return "construction"
    if re.search(r"restaurante|hotel|alojamiento|turismo|resort|bar|chiringuito|habitaciones|reservas|menu|carta", value):
        return "hospitality"
    return "generic"


def page_type_for_url(url: str, label: str = "") -> str:
    target = strip_accents((url + " " + label).lower())
    for page_type, patterns in PAGE_PATTERNS.items():
        if any(re.search(pattern, target, re.I) for pattern in patterns):
            return page_type
    return "home" if is_home(url) else "unknown"


def extract_links(base_url: str, page_html: str) -> list[tuple[str, str, str]]:
    links: list[tuple[str, str, str]] = []
    for match in re.finditer(r'(?is)<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', page_html or ""):
        href = html.unescape(match.group(1)).strip()
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        absolute = clean_url(urljoin(base_url, href).split("#")[0])
        if not same_domain(base_url, absolute) or is_excluded_url(absolute):
            continue
        label = plain_text(match.group(2))
        links.append((absolute, label, page_type_for_url(absolute, label)))
    seen: set[str] = set()
    unique: list[tuple[str, str, str]] = []
    for item in links:
        if item[0] not in seen:
            seen.add(item[0])
            unique.append(item)
    return unique


def add_unique_page(pages: list[dict[str, str]], url: str, page_type: str, base_url: str) -> None:
    clean = clean_url(url)
    if len(pages) >= MAX_PAGES or not same_domain(base_url, clean) or is_excluded_url(clean):
        return
    if any(item["url"] == clean for item in pages):
        return
    pages.append({"url": clean, "pageType": page_type})


def select_pages_to_audit(input_url: str, home: "FetchResult", profile: str) -> tuple[list["FetchResult"], list[dict[str, Any]]]:
    """Fase 7I-B deep discovery, bounded strictly by MAX_PAGES (8), static
    HTML only — no JS execution, no Playwright, no infinite crawl.

    Pass 1: classify every same-domain link found on the home page with
    commercial_page_type() and visit them in priority order (contact,
    listing, promotion, property, then anything matching a location
    keyword). Pass 2: for the listing/promotion pages just visited, look at
    THEIR links for individual property pages not already discovered (this
    is what lets a real estate site's "Residencial" index page lead us to
    its actual property fichas within the same MAX_PAGES budget).

    Returns (pages, urls_reviewed). pages still carries the legacy
    page_type (mapped via legacy_page_type_for_commercial) so existing
    scoring/evidence code is unaffected. urls_reviewed carries the new
    commercial pageType + selectedReason for enrichmentCandidates.pageDiscovery.
    """
    base = home_url(normalize_url(input_url))
    visited: set[str] = {clean_url(base)}
    pages: list[FetchResult] = [home]
    urls_reviewed: list[dict[str, Any]] = [
        {"url": home.final_url or home.url, "pageType": "home", "selectedReason": "home_page"}
    ]

    normalized = normalize_url(input_url)
    if normalized and normalized != base and same_domain(base, normalized) and not is_excluded_url(normalized):
        clean = clean_url(normalized)
        if clean not in visited:
            visited.add(clean)
            kind = commercial_page_type(normalized, "")
            res = fetch_page(normalized, legacy_page_type_for_commercial(kind))
            pages.append(res)
            urls_reviewed.append({"url": res.final_url or res.url, "pageType": kind, "selectedReason": "input_url"})

    if not home.ok or not home.html or len(pages) >= MAX_PAGES:
        return pages[:MAX_PAGES], urls_reviewed[:MAX_PAGES]

    home_links = extract_links(base, home.html)
    classified = [(url, label, commercial_page_type(url, label)) for url, label, _legacy in home_links]
    location_re = re.compile("|".join(re.escape(strip_accents(k.lower())) for k in COMMERCIAL_LOCATION_KEYWORDS), re.I)

    second_level_sources: list[FetchResult] = []

    for ptype in ("contact", "listing", "promotion", "property"):
        if len(pages) >= MAX_PAGES:
            break
        for url, _label, kind in classified:
            if len(pages) >= MAX_PAGES:
                break
            if kind != ptype:
                continue
            clean = clean_url(url)
            if clean in visited or is_excluded_url(clean):
                continue
            visited.add(clean)
            res = fetch_page(url, legacy_page_type_for_commercial(kind))
            pages.append(res)
            urls_reviewed.append({"url": res.final_url or res.url, "pageType": kind, "selectedReason": "matched_keyword_on_home:" + kind})
            if kind in ("listing", "promotion") and res.ok:
                second_level_sources.append(res)

    # Filler pass: same-domain links mentioning a target location (e.g. "torrevieja",
    # "costa blanca") that weren't already classified into a commercial type above.
    if len(pages) < MAX_PAGES:
        for url, label, kind in classified:
            if len(pages) >= MAX_PAGES:
                break
            if kind != "other" or not location_re.search(strip_accents((url + " " + label).lower())):
                continue
            clean = clean_url(url)
            if clean in visited or is_excluded_url(clean):
                continue
            visited.add(clean)
            res = fetch_page(url, legacy_page_type_for_commercial(kind))
            pages.append(res)
            urls_reviewed.append({"url": res.final_url or res.url, "pageType": kind, "selectedReason": "matched_location_keyword"})

    # Pass 2: dig into listing/promotion pages for individual property links
    # they reference that weren't already discovered from the home page.
    for src in second_level_sources:
        if len(pages) >= MAX_PAGES:
            break
        for url, _label, kind in [(u, l, commercial_page_type(u, l)) for u, l, _legacy in extract_links(base, src.html)]:
            if len(pages) >= MAX_PAGES:
                break
            if kind != "property":
                continue
            clean = clean_url(url)
            if clean in visited or is_excluded_url(clean):
                continue
            visited.add(clean)
            res = fetch_page(url, legacy_page_type_for_commercial(kind))
            pages.append(res)
            urls_reviewed.append({"url": res.final_url or res.url, "pageType": kind, "selectedReason": "linked_from:" + (src.final_url or src.url)})

    return pages[:MAX_PAGES], urls_reviewed[:MAX_PAGES]


def has_any(text: str, patterns: list[str]) -> bool:
    normalized = strip_accents(text).lower()
    return any(re.search(pattern, normalized, re.I) for pattern in patterns)


def add_evidence(evidence: dict[str, list[str]], key: str, value: str) -> None:
    if not value:
        return
    evidence.setdefault(key, [])
    if len(evidence[key]) < 3 and value not in evidence[key]:
        evidence[key].append(value[:140])


def evidence_from_pages(pages: list[FetchResult]) -> tuple[dict[str, bool], dict[str, bool], dict[str, list[str]]]:
    combined_html = "\n".join(page.html for page in pages if page.html)
    combined_text = plain_text(combined_html)
    lower_html = combined_html.lower()
    lower_text = strip_accents(combined_text).lower()
    evidence: dict[str, list[str]] = {}

    for page in pages:
        page_text = strip_accents(plain_text(page.html)).lower()
        page_html = page.html.lower()
        marker = "/" if page.page_type == "home" else page.page_type
        checks = {
            "hasWhatsapp": bool(re.search(r"whatsapp|wa\.me|api\.whatsapp", page_html)),
            "hasContactForm": bool(re.search(r"(?is)<form\b", page.html)),
            "hasVirtualTourSignals": has_any(page_html + " " + page_text, [r"matterport", r"tour virtual", r"virtual tour", r"\b360\b", r"recorrido virtual", r"visita virtual"]),
            "hasVideoSignals": bool(re.search(r"youtube|vimeo|<video|youtu\.be", page_html)),
            "hasClearCTA": has_any(page_text, [r"contactar", r"llamar", r"reservar", r"solicitar visita", r"pedir informacion", r"presupuesto", r"request information", r"book a viewing", r"appointment", r"pide cita"]),
        }
        for key, ok in checks.items():
            if ok:
                add_evidence(evidence, key, f"{key} detected on {marker}")
        if page.page_type in {"portfolio", "services", "listings", "contact"}:
            add_evidence(evidence, f"pageType:{page.page_type}", f"{page.page_type} page audited: {urlparse(page.final_url or page.url).path or '/'}")

    signals = {
        "hasTitle": bool(first_match(r"<title[^>]*>(.*?)</title>", pages[0].html if pages else "")),
        "hasMetaDescription": bool(first_match(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', pages[0].html if pages else "")),
        "hasViewport": bool(re.search(r'<meta[^>]+name=["\']viewport["\']', pages[0].html if pages else "", re.I)),
        "hasPhone": bool(re.search(r"(\+?\d[\d\s()./-]{7,}\d)", combined_text)),
        "hasEmail": bool(re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", combined_text, re.I)),
        "hasWhatsapp": bool(re.search(r"whatsapp|wa\.me|api\.whatsapp", lower_html)),
        "hasContactForm": bool(re.search(r"(?is)<form\b", combined_html)) or has_any(lower_text, [r"formulario", r"contact form"]),
        "hasClearCTA": has_any(lower_text, [r"contactar", r"llamar", r"reservar", r"solicitar visita", r"pedir informacion", r"presupuesto", r"request information", r"book a viewing", r"schedule", r"appointment", r"pide cita"]),
        "hasPropertyListings": has_any(lower_text, [r"propiedades", r"inmuebles", r"viviendas", r"venta", r"alquiler", r"for sale", r"properties", r"villas", r"apartments", r"obra nueva", r"promociones"]),
        "hasVirtualTourSignals": has_any(lower_html + " " + lower_text, [r"matterport", r"tour virtual", r"virtual tour", r"\b360\b", r"recorrido virtual", r"visita virtual"]),
        "hasVideoSignals": bool(re.search(r"youtube|vimeo|<video|youtu\.be", lower_html)),
        "hasSocialLinks": bool(re.search(r"instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com", lower_html)),
        "hasGenericPortalSignals": has_any(lower_html + " " + lower_text, [r"idealista", r"fotocasa", r"habitaclia", r"kyero", r"thinkspain"]),
        "hasPremiumSignals": has_any(lower_text, [r"premium", r"luxury", r"lujo", r"villa", r"villas", r"sea view", r"costa blanca", r"altea hills", r"exclusivo"]),
    }

    vertical_signals = {
        "hasPortfolio": any(page.page_type == "portfolio" for page in pages) or has_any(lower_text, [r"portfolio", r"proyectos", r"trabajos", r"obras", r"realizaciones", r"casos"]),
        "hasProjectGallery": has_any(lower_text, [r"galeria", r"gallery", r"proyectos", r"portfolio"]),
        "hasShowroom": has_any(lower_text, [r"showroom", r"tienda", r"exposicion"]),
        "hasCatalog": has_any(lower_text, [r"catalogo", r"catalog", r"productos"]),
        "hasProducts": has_any(lower_text, [r"productos", r"products", r"marcas", r"brands"]),
        "hasBrands": has_any(lower_text, [r"marcas", r"brands"]),
        "hasBeforeAfter": has_any(lower_text, [r"antes despues", r"antes y despues", r"before after", r"before-after"]),
        "hasAppointmentCTA": has_any(lower_text, [r"cita", r"appointment", r"pide cita", r"reservar"]),
        "hasBudgetCTA": has_any(lower_text, [r"presupuesto", r"quote", r"solicitar presupuesto"]),
        "hasShowroomTour": has_any(lower_text + " " + lower_html, [r"showroom.*360", r"tour showroom", r"visita virtual showroom"]),
        "hasPremiumPropertySignals": signals["hasPremiumSignals"],
        "hasBuyerCTA": has_any(lower_text, [r"solicitar visita", r"book a viewing", r"comprador", r"buyer", r"visita"]),
        "hasMatterportSignals": has_any(lower_html, [r"matterport"]),
        "hasForeignBuyerSignals": has_any(lower_text, [r"english", r"deutsch", r"francais", r"buyer", r"international", r"extranjero"]),
        "hasListingsPage": any(page.page_type == "listings" for page in pages),
        "hasProjects": has_any(lower_text, [r"proyectos", r"projects"]),
        "hasRenders": has_any(lower_text, [r"renders", r"render", r"visualizacion"]),
        "hasPlans": has_any(lower_text, [r"planos", r"plans"]),
        "hasCaseStudies": has_any(lower_text, [r"casos", r"case studies"]),
        "hasConsultationCTA": has_any(lower_text, [r"consulta", r"consultation", r"contactar"]),
        "has3DVisualization": has_any(lower_text, [r"3d", r"render", r"visualizacion"]),
        "hasCompletedWorks": has_any(lower_text, [r"obras realizadas", r"trabajos realizados", r"reformas realizadas"]),
        "hasServices": has_any(lower_text, [r"servicios", r"services", r"soluciones"]),
        "hasVisualProof": has_any(lower_text, [r"galeria", r"fotos", r"video", r"antes"]),
        "hasReservationCTA": has_any(lower_text, [r"reservar", r"reservas", r"booking", r"book now"]),
        "hasMenu": has_any(lower_text, [r"menu", r"carta"]),
        "hasRooms": has_any(lower_text, [r"habitaciones", r"rooms", r"alojamiento"]),
        "hasSpaces": has_any(lower_text, [r"espacios", r"salones", r"terraza", r"rooms"]),
        "hasLocationSignals": has_any(lower_text, [r"ubicacion", r"location", r"como llegar"]),
        "hasGallery": has_any(lower_text, [r"galeria", r"gallery"]),
        "hasEvents": has_any(lower_text, [r"eventos", r"events"]),
        "hasContactCTA": signals["hasClearCTA"],
        "hasVisualAssets": signals["hasVideoSignals"] or signals["hasVirtualTourSignals"] or has_any(lower_text, [r"galeria", r"portfolio"]),
    }
    for key, value in {**signals, **vertical_signals}.items():
        if value and key not in evidence:
            add_evidence(evidence, key, f"{key} inferred from audited pages")
    return signals, vertical_signals, evidence


def technology_signals(page_html: str) -> list[str]:
    lower = (page_html or "").lower()
    checks = {
        "wordpress": "wp-content" in lower or "wp-json" in lower,
        "elementor": "elementor" in lower,
        "wix": "wixstatic" in lower or "wix.com" in lower,
        "squarespace": "squarespace" in lower,
        "webflow": "webflow" in lower,
        "shopify": "shopify" in lower,
    }
    return [name for name, ok in checks.items() if ok]


def score_and_recommend(base: dict[str, Any], profile: str) -> dict[str, Any]:
    signals = base["signals"]
    vertical = base["verticalSignals"]
    weaknesses: list[str] = []
    opportunities: list[str] = []
    score = 20 if base["reachable"] else 0

    if not base["reachable"]:
        return {
            "weaknesses": ["Web inaccesible o no disponible en la muestra analizada."],
            "opportunities": ["Proponer landing/ficha inmersiva basica antes de una campana."],
            "websiteOpportunityScore": 65,
            "recommendedService": "Landing inmersiva basica + ficha comercial 360",
            "recommendedNextAction": "Validar web/contacto y preparar propuesta de presencia visual minima.",
            "confidence": "baja",
        }

    if not base["usesHttps"]:
        score += 10
        weaknesses.append("No se confirma HTTPS en la URL final.")
    if not signals["hasViewport"]:
        score += 8
        weaknesses.append("No se detecta viewport responsive en la home.")
    if not signals["hasMetaDescription"]:
        score += 5
        weaknesses.append("Meta description ausente o no detectada.")
    if not signals["hasClearCTA"]:
        score += 10
        weaknesses.append("Falta de CTA claro detectado.")
    if not signals["hasWhatsapp"]:
        score += 6
        weaknesses.append("No se detecta WhatsApp visible.")
    if not signals["hasContactForm"]:
        score += 6
        weaknesses.append("No se detecta formulario de contacto visible.")
    if not signals["hasVirtualTourSignals"]:
        score += 12
        weaknesses.append("No se detectan tours virtuales/360 en la muestra analizada.")
    else:
        score -= 12
        opportunities.append("Revisar si el tour existente capta leads o solo muestra contenido.")
    if signals["hasVideoSignals"]:
        score += 4
        opportunities.append("Conectar video existente con landing/tour/CTA para captacion.")
    if base["loadTimeMs"] >= 3500:
        score += 8
        weaknesses.append("Carga basica lenta en la muestra analizada.")

    service = "Website Opportunity Audit + experiencia visual comercial"
    next_action = "Revisar web y seleccionar un activo visual para demo."

    if profile == "real_estate":
        if signals["hasPropertyListings"]:
            score += 12
            opportunities.append("Convertir propiedades destacadas en experiencias inmersivas medibles.")
        if signals["hasPropertyListings"] and not signals["hasVirtualTourSignals"]:
            score += 12
        if vertical["hasPremiumPropertySignals"]:
            score += 8
            opportunities.append("Usar una propiedad premium como demo piloto.")
        service = "Pack Inmobiliaria 360: tour, hotspots, landing y captacion"
        next_action = "Elegir una propiedad destacada y preparar demo 360 con CTA."
    elif profile == "interior_design":
        if vertical["hasPortfolio"] or vertical["hasShowroom"] or vertical["hasCatalog"]:
            score += 15
            opportunities.append("Crear tour 360 del showroom o portfolio inmersivo de proyectos.")
        if vertical["hasBeforeAfter"]:
            score += 6
            opportunities.append("Convertir antes/despues en demo interactiva.")
        if not vertical["hasAppointmentCTA"] and not vertical["hasBudgetCTA"]:
            score += 8
            weaknesses.append("No se detecta CTA claro de cita o presupuesto.")
        service = "Tour showroom + portfolio inmersivo con hotspots de producto"
        next_action = "Seleccionar showroom/proyecto y preparar demo con CTA de cita o presupuesto."
    elif profile == "architecture":
        if vertical["hasProjects"] or vertical["hasRenders"]:
            score += 14
            opportunities.append("Convertir proyectos/renders en experiencia 3D/360 explicativa.")
        if not vertical["hasConsultationCTA"]:
            score += 7
            weaknesses.append("No se detecta CTA claro de consulta.")
        service = "Portfolio inmersivo de proyectos + visualizacion 3D/360"
        next_action = "Elegir un proyecto representativo y preparar demo visual consultiva."
    elif profile == "construction":
        if vertical["hasBeforeAfter"] or vertical["hasCompletedWorks"]:
            score += 15
            opportunities.append("Crear galeria inmersiva antes/despues de obras realizadas.")
        if not vertical["hasBudgetCTA"]:
            score += 7
            weaknesses.append("No se detecta CTA claro de presupuesto.")
        service = "Tour 360 de reforma terminada + landing de prueba visual"
        next_action = "Seleccionar una obra terminada y preparar demo antes/despues."
    elif profile == "hospitality":
        if vertical["hasRooms"] or vertical["hasSpaces"] or vertical["hasGallery"]:
            score += 14
            opportunities.append("Crear tour 360 del local/hotel para reservas y eventos.")
        if not vertical["hasReservationCTA"]:
            score += 7
            weaknesses.append("No se detecta CTA claro de reserva.")
        service = "Tour ambiente 360 + landing para reservas"
        next_action = "Auditar espacio clave y preparar recorrido con CTA de reserva."
    else:
        if vertical["hasPortfolio"] or vertical["hasServices"]:
            score += 10
            opportunities.append("Convertir portfolio/servicios en experiencia visual con CTA.")
        service = "Experiencia visual comercial + CTA medible"

    if signals["hasClearCTA"] and signals["hasWhatsapp"] and signals["hasContactForm"] and signals["hasVirtualTourSignals"]:
        score -= 10

    confidence = "alta" if base["pagesAudited"] >= 3 else "media"
    if base["htmlSize"] < 800 or not base["reachable"]:
        confidence = "baja"
    return {
        "weaknesses": weaknesses,
        "opportunities": opportunities,
        "websiteOpportunityScore": max(0, min(100, score)),
        "recommendedService": service,
        "recommendedNextAction": next_action,
        "confidence": confidence,
    }


def page_summary(page: FetchResult) -> dict[str, Any]:
    meta = first_match(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', page.html)
    if not meta:
        meta = first_match(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']', page.html)
    signals, _vertical, _evidence = evidence_from_pages([page])
    return {
        "url": page.url,
        "finalUrl": page.final_url,
        "pageType": page.page_type,
        "reachable": page.ok,
        "httpStatus": page.status,
        "loadTimeMs": page.load_time_ms,
        "title": first_match(r"<title[^>]*>(.*?)</title>", page.html)[:180],
        "metaDescription": meta[:240],
        "signals": signals,
    }


# ── Fase 7B-local: enrichment candidate extraction ──────────────────────────
# Pure regex/HTML parsing. No JS execution, no Playwright, no image downloads.
# Every result here is a *candidate* — nothing is auto-approved. The CRM
# operator decides what becomes a real mediaAssetsManual/lead field.

PHONE_PATTERN = re.compile(r"(\+?\d[\d\s()./-]{6,}\d)")
EMAIL_PATTERN = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
# Fase 7K: (?<![a-z0-9]) before the domain alternation stops a *substring*
# false-positive — without it "x\.com" matched inside "dropbox.com" (the
# literal "x.com" tail of that word), which is exactly how a Dropbox
# gallery link on the real Duly Investment site ended up mislabeled as a
# social link. The boundary requires the domain to start right after a
# non-alphanumeric character (protocol "//", a subdomain ".", etc.), so
# legitimate "https://x.com/..." or "https://www.x.com/..." still match.
WHATSAPP_HREF_PATTERN = re.compile(r'href=["\']([^"\']*(?<![a-z0-9])(?:wa\.me|api\.whatsapp\.com)[^"\']*)["\']', re.I)
SOCIAL_HREF_PATTERN = re.compile(
    r'href=["\']([^"\']*(?<![a-z0-9])(?:instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|twitter\.com|x\.com|pinterest\.com)[^"\']*)["\']',
    re.I,
)
LOGO_HINT_RE = re.compile(r"logo|brand|marca", re.I)
HERO_HINT_RE = re.compile(r"hero|banner|cover|slide|portada", re.I)
ADDRESS_PREFIX_RE = re.compile(
    r"(?:calle|c/|avda\.?|avenida|plaza|paseo|carrer|camino|urb\.?|urbanizaci[oó]n)\s+[A-Za-zÀ-ÿ0-9][^,<\n]{3,70}",
    re.I,
)
LINK_TAG_RE = re.compile(r"<link\b([^>]*)>", re.I)
META_TAG_RE = re.compile(r"<meta\b([^>]*)>", re.I)
IMG_TAG_RE = re.compile(r"<img\b([^>]*)>", re.I)
SOURCE_TAG_RE = re.compile(r"<source\b([^>]*)>", re.I)
HEADING_RE = re.compile(r"(?is)<(h1|h2)\b[^>]*>(.*?)</\1>")
INLINE_STYLE_COLOR_RE = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
INLINE_STYLE_ATTR_RE = re.compile(r'style=["\']([^"\']*)["\']', re.I)
BG_IMAGE_STYLE_RE = re.compile(r"background(?:-image)?\s*:\s*[^;]*url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", re.I)
DIRECT_IMAGE_HREF_RE = re.compile(r'href=["\']([^"\']+\.(?:jpg|jpeg|png|webp|avif))(?:[?#][^"\']*)?["\']', re.I)
# Fase 7I-B: drop icons/sprites/flags/placeholders/plugin chrome before they
# ever reach allImages. Generic SVGs are dropped too unless they carry
# logo/brand evidence (handled separately in extract_logo_candidates).
IMAGE_DISCARD_RE = re.compile(
    r"icon|sprite|flag[-_./]|cookie|placeholder|loading|spinner|retina|blank\.|transparent|"
    r"[-_]pixel\b|pixel[-_.]|wp-content/plugins|elementor[^\"'\s]*(?:widget|icon)",
    re.I,
)
GENERIC_SVG_RE = re.compile(r"\.svg(\?|#|$)", re.I)
# Fase 7I-B logo anti-false-positive: known template/CMS-provider signals
# that downgrade confidence even when logo/brand keywords also match —
# confirmed real-world case in Sandhouse QA (eGO Real Estate's own logo,
# not the client's).
LOGO_NEGATIVE_RE = re.compile(
    r"wordpress|elementor|\bego\b|wp-content/plugins|template|plantilla|favicon-only|loading|"
    r"placeholder|retina|footer-logo|provider|powered|webflow|wix|squarespace|shopify",
    re.I,
)
LOGO_CONTEXT_RE = re.compile(r"header|navbar|nav-|site-logo|brand", re.I)


def attr_value(attrs: str, name: str) -> str:
    match = re.search(rf'{name}\s*=\s*["\']([^"\']*)["\']', attrs or "", re.I)
    return html.unescape(match.group(1)).strip() if match else ""


def extract_link_tags(page_html: str) -> list[tuple[str, str]]:
    """Returns (rel, href) pairs, order-independent (rel/href can appear in any order)."""
    out: list[tuple[str, str]] = []
    for m in LINK_TAG_RE.finditer(page_html or ""):
        attrs = m.group(1)
        rel = attr_value(attrs, "rel").lower()
        href = attr_value(attrs, "href")
        if rel and href:
            out.append((rel, href))
    return out


def extract_meta_tags(page_html: str) -> list[tuple[str, str]]:
    """Returns (property_or_name, content) pairs, order-independent."""
    out: list[tuple[str, str]] = []
    for m in META_TAG_RE.finditer(page_html or ""):
        attrs = m.group(1)
        key = attr_value(attrs, "property") or attr_value(attrs, "name")
        content = attr_value(attrs, "content")
        if key and content:
            out.append((key.lower(), content))
    return out


def first_srcset_url(srcset: str) -> str:
    """srcset="a.jpg 480w, b.jpg 960w" -> "a.jpg" (first candidate is enough;
    we never download images to pick the "best" one)."""
    if not srcset:
        return ""
    first = srcset.split(",")[0].strip()
    return first.split()[0] if first else ""


def extract_img_tags(page_html: str) -> list[dict[str, str]]:
    """Fase 7I-B: also captures lazy-loaded sources (data-src, data-lazy-src,
    data-original, srcset/data-srcset) and <picture><source srcset> — pure
    HTML attribute parsing, still no JS execution."""
    out: list[dict[str, str]] = []
    for m in IMG_TAG_RE.finditer(page_html or ""):
        attrs = m.group(1)
        src = (
            attr_value(attrs, "src")
            or attr_value(attrs, "data-src")
            or attr_value(attrs, "data-lazy-src")
            or attr_value(attrs, "data-original")
            or first_srcset_url(attr_value(attrs, "srcset"))
            or first_srcset_url(attr_value(attrs, "data-srcset"))
        )
        if not src:
            continue
        out.append(
            {
                "src": src,
                "alt": attr_value(attrs, "alt"),
                "class": attr_value(attrs, "class"),
                "id": attr_value(attrs, "id"),
                "width": attr_value(attrs, "width"),
                "height": attr_value(attrs, "height"),
            }
        )
    for m in SOURCE_TAG_RE.finditer(page_html or ""):
        attrs = m.group(1)
        src = first_srcset_url(attr_value(attrs, "srcset")) or attr_value(attrs, "src")
        if not src:
            continue
        out.append({"src": src, "alt": "", "class": attr_value(attrs, "class"), "id": "", "width": "", "height": ""})
    return out


def extract_background_images(page_html: str) -> list[dict[str, str]]:
    """Inline style="background-image:url(...)" on any tag, plus the common
    lazy-background-plugin attributes data-bg/data-background."""
    out: list[dict[str, str]] = []
    for m in INLINE_STYLE_ATTR_RE.finditer(page_html or ""):
        bgm = BG_IMAGE_STYLE_RE.search(m.group(1))
        if bgm:
            out.append({"src": bgm.group(1), "alt": "", "class": "", "id": "", "width": "", "height": ""})
    for attr_name in ("data-bg", "data-background"):
        for m in re.finditer(rf'{attr_name}\s*=\s*["\']([^"\']+)["\']', page_html or "", re.I):
            out.append({"src": m.group(1), "alt": "", "class": "", "id": "", "width": "", "height": ""})
    return out


def extract_direct_image_links(page_html: str) -> list[dict[str, str]]:
    """<a href="....jpg/.png/.webp/.avif"> — common for "view full size" /
    lightbox links on property gallery pages."""
    out: list[dict[str, str]] = []
    for m in DIRECT_IMAGE_HREF_RE.finditer(page_html or ""):
        out.append({"src": m.group(1), "alt": "", "class": "", "id": "", "width": "", "height": ""})
    return out


def is_discardable_image(url: str, alt: str = "", class_: str = "", id_: str = "") -> tuple[bool, str]:
    """Fase 7I-B: never let icons/sprites/flags/placeholders/plugin chrome
    reach allImages/propertyImages/heroImages. Returns (discard, reason)."""
    haystack = " ".join([url or "", alt or "", class_ or "", id_ or ""])
    m = IMAGE_DISCARD_RE.search(haystack)
    if m:
        return True, "matched discard pattern: " + m.group(0)
    if GENERIC_SVG_RE.search(url or "") and not LOGO_HINT_RE.search(haystack):
        return True, "generic svg without brand/logo evidence"
    return False, ""


def contact_candidate(value: str, source: str, confidence: str) -> dict[str, str]:
    return {"value": value, "source": source, "confidence": confidence}


def image_candidate(url: str, source: str, confidence: str, reason: str = "", alt: str = "", recommended_use: str = "unknown") -> dict[str, str]:
    return {"url": url, "source": source, "confidence": confidence, "reason": reason, "alt": alt, "recommendedUse": recommended_use}


def extract_phone_candidates(text: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for match in PHONE_PATTERN.finditer(text or ""):
        raw = match.group(1).strip()
        digits = re.sub(r"\D", "", raw)
        if not (7 <= len(digits) <= 15):
            continue
        if digits in seen:
            continue
        seen.add(digits)
        out.append(contact_candidate(raw, "text", "medium"))
        if len(out) >= MAX_PHONES:
            break
    return out


def extract_email_candidates(text: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for match in EMAIL_PATTERN.finditer(text or ""):
        value = match.group(0).lower()
        if value in seen:
            continue
        seen.add(value)
        out.append(contact_candidate(value, "text", "medium"))
        if len(out) >= MAX_EMAILS:
            break
    return out


def extract_whatsapp_candidates(page_html: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for match in WHATSAPP_HREF_PATTERN.finditer(page_html or ""):
        value = html.unescape(match.group(1).strip())
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(contact_candidate(value, "link_href", "high"))
        if len(out) >= MAX_WHATSAPP_LINKS:
            break
    return out


def extract_social_candidates(page_html: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for match in SOCIAL_HREF_PATTERN.finditer(page_html or ""):
        value = html.unescape(match.group(1).strip())
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(contact_candidate(value, "link_href", "high"))
        if len(out) >= MAX_SOCIAL_LINKS:
            break
    return out


def extract_address_candidates(page_html: str, plain: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    # High confidence: schema.org microdata / JSON-LD streetAddress.
    for pattern in (
        r'itemprop=["\']streetAddress["\'][^>]*>([^<]{4,140})<',
        r'"streetAddress"\s*:\s*"([^"]{4,140})"',
    ):
        for match in re.finditer(pattern, page_html or "", re.I):
            value = html.unescape(match.group(1)).strip()
            if value and value not in seen:
                seen.add(value)
                out.append(contact_candidate(value, "schema_org", "high"))
    # Low confidence fallback, only if nothing structured was found — avoids
    # flooding candidates with false positives from plain regex matching.
    if not out:
        for match in ADDRESS_PREFIX_RE.finditer(plain or ""):
            value = match.group(0).strip()
            if value and value not in seen:
                seen.add(value)
                out.append(contact_candidate(value, "text", "low"))
            if len(out) >= MAX_ADDRESSES:
                break
    return out[:MAX_ADDRESSES]


def extract_favicon_candidates(base_url: str, page_html: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for rel, href in extract_link_tags(page_html):
        if "icon" not in rel:
            continue
        url = absolute_asset_url(base_url, href)
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(image_candidate(url, "favicon", "high", reason=f"<link rel=\"{rel}\">", recommended_use="favicon"))
        if len(out) >= MAX_FAVICONS:
            break
    return out


def business_name_keywords(business_name: str) -> list[str]:
    """'Duly Investment' -> ['duly', 'investment'] — words of 3+ chars used to
    raise logo confidence when an <img>'s alt/src/class actually matches the
    lead's own name, not a generic 'logo' keyword."""
    name = strip_accents(business_name or "").lower()
    return [w for w in re.split(r"[^a-z0-9]+", name) if len(w) >= 3]


def extract_logo_candidates(base_url: str, page_html: str, business_name: str = "") -> list[dict[str, str]]:
    """Fase 7I-B: never invents a logo — an empty list is a valid result.
    Confidence rises when the lead's own business name appears in the
    image's alt/src/class/id (not just a generic 'logo' keyword), and drops
    (with an explicit warning in `reason`) when known template/CMS-provider
    signals are present, even if a logo/brand keyword also matched."""
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    name_words = business_name_keywords(business_name)
    for img in extract_img_tags(page_html):
        haystack = " ".join([img["src"], img["alt"], img["class"], img["id"]])
        haystack_norm = strip_accents(haystack).lower()
        is_logo_generic = bool(LOGO_HINT_RE.search(haystack))
        is_logo_named = any(w in haystack_norm for w in name_words)
        is_header_ctx = bool(LOGO_CONTEXT_RE.search(haystack))
        if not (is_logo_generic or is_logo_named or is_header_ctx):
            continue
        url = absolute_asset_url(base_url, img["src"])
        if not url or url in seen:
            continue
        seen.add(url)
        negative = LOGO_NEGATIVE_RE.search(haystack)
        if negative:
            confidence = "low"
        elif is_logo_named and (is_logo_generic or is_header_ctx):
            confidence = "high"
        elif is_logo_generic or is_logo_named or is_header_ctx:
            confidence = "medium"
        else:
            confidence = "low"
        reason_parts = []
        if is_logo_generic:
            reason_parts.append("matched logo|brand|marca")
        if is_logo_named:
            reason_parts.append("matched business name")
        if is_header_ctx:
            reason_parts.append("matched header/nav/site-logo context")
        if negative:
            reason_parts.append("WARNING: possible template/CMS-provider logo (" + negative.group(0) + "), not the client's")
        out.append(image_candidate(url, "website_html", confidence, reason=" + ".join(reason_parts), alt=img["alt"], recommended_use="logo"))
    # Sort by confidence before capping so a real high-confidence logo found
    # later in the HTML is never pushed out by an earlier low-confidence one.
    confidence_rank = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda c: confidence_rank.get(c["confidence"], 3))
    return out[:MAX_LOGOS]


def extract_og_image_candidates(base_url: str, page_html: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for key, content in extract_meta_tags(page_html):
        if key != "og:image":
            continue
        url = absolute_asset_url(base_url, content)
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(image_candidate(url, "og_image", "high", reason="meta property=og:image", recommended_use="hero"))
        if len(out) >= MAX_OG_IMAGES:
            break
    return out


def extract_twitter_image_candidates(base_url: str, page_html: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for key, content in extract_meta_tags(page_html):
        if key not in ("twitter:image", "twitter:image:src"):
            continue
        url = absolute_asset_url(base_url, content)
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(image_candidate(url, "twitter_image", "high", reason=f"meta name={key}", recommended_use="hero"))
        if len(out) >= MAX_TWITTER_IMAGES:
            break
    return out


def classify_remaining_images(
    base_url: str, pages: list["FetchResult"], page_commercial_type: dict[str, str], excluded_urls: set[str], profile: str
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    """Fase 7I-B: returns (heroImages, propertyImages, allImages,
    discardedImages). Images are gathered from <img> (incl. lazy-load
    attrs/srcset), inline background-image, and direct .jpg/.png/.webp/.avif
    links — never downloaded, never JS-executed. Classification is now
    page-type-aware: images found on a page already classified as
    property/promotion/listing go to propertyImages with real confidence
    (high for an individual property ficha, medium for a listing/promotion
    index page) instead of relying only on keyword guessing. Icons/sprites/
    flags/placeholders/plugin chrome are filtered into discardedImages
    instead of polluting allImages."""
    hero: list[dict[str, str]] = []
    property_imgs: list[dict[str, str]] = []
    all_imgs: list[dict[str, str]] = []
    discarded: list[dict[str, str]] = []
    seen: set[str] = set()
    is_real_estate = profile == "real_estate"
    property_hint_re = re.compile(r"propiedad|inmueble|vivienda|villa|piso|apartamento|casa|property", re.I)

    for page in pages:
        if not page.html:
            continue
        page_key = page.final_url or page.url
        commercial_type = page_commercial_type.get(page_key, page_commercial_type.get(page.url, "other"))
        tags = extract_img_tags(page.html) + extract_background_images(page.html) + extract_direct_image_links(page.html)
        for img in tags:
            url = absolute_asset_url(base_url, img["src"])
            if not url or url in excluded_urls or url in seen:
                continue
            seen.add(url)

            discard, discard_reason = is_discardable_image(img["src"], img.get("alt", ""), img.get("class", ""), img.get("id", ""))
            if discard:
                if len(discarded) < MAX_DISCARDED_IMAGES:
                    discarded.append(image_candidate(url, "website_html", "low", reason=discard_reason, alt=img.get("alt", ""), recommended_use="discarded"))
                continue

            haystack = " ".join([img["src"], img.get("alt", ""), img.get("class", ""), img.get("id", "")])
            width = int(img["width"]) if img.get("width", "").isdigit() else 0
            height = int(img["height"]) if img.get("height", "").isdigit() else 0
            looks_large = width >= 400 or height >= 300
            looks_hero_hint = bool(HERO_HINT_RE.search(haystack))

            if is_real_estate and commercial_type in ("property", "promotion", "listing") and len(property_imgs) < MAX_PROPERTY_IMAGES:
                confidence = "high" if commercial_type == "property" else "medium"
                property_imgs.append(image_candidate(
                    url, "website_html", confidence, reason=f"image found on {commercial_type} page ({page_key})",
                    alt=img.get("alt", ""), recommended_use="property",
                ))
                continue
            if commercial_type == "home" and (looks_hero_hint or looks_large) and len(hero) < MAX_HERO_IMAGES:
                reason = "class/id/alt matched hero|banner|cover on home" if looks_hero_hint else "declared width/height suggests a large image on home"
                hero.append(image_candidate(url, "website_html", "medium" if looks_hero_hint else "low", reason=reason, alt=img.get("alt", ""), recommended_use="hero"))
                continue
            if looks_hero_hint and len(hero) < MAX_HERO_IMAGES:
                hero.append(image_candidate(url, "website_html", "medium", reason="class/id/alt matched hero|banner|cover", alt=img.get("alt", ""), recommended_use="hero"))
                continue
            if is_real_estate and property_hint_re.search(haystack) and len(property_imgs) < MAX_PROPERTY_IMAGES:
                property_imgs.append(image_candidate(url, "website_html", "low", reason="img src/alt matched property-related keywords", alt=img.get("alt", ""), recommended_use="property"))
                continue
            if len(all_imgs) < MAX_ALL_IMAGES:
                all_imgs.append(image_candidate(url, "website_html", "low", reason=f"img found on {commercial_type} page", alt=img.get("alt", ""), recommended_use="unknown"))

    return hero, property_imgs, all_imgs, discarded


def extract_brand_signals(base_url: str, home_html: str, all_pages: list[FetchResult]) -> dict[str, Any]:
    headings: list[str] = []
    seen_headings: set[str] = set()
    for match in HEADING_RE.finditer(home_html or ""):
        text = plain_text(match.group(2))
        if text and text not in seen_headings:
            seen_headings.add(text)
            headings.append(text[:160])
        if len(headings) >= MAX_HEADINGS:
            break
    claims = [h1 for h1 in headings if h1][:MAX_CLAIMS]

    internal_links: list[dict[str, str]] = []
    seen_links: set[str] = set()
    audited_urls = {page.final_url or page.url: page.page_type for page in all_pages}
    relevant_types = {"contact", "listings", "services", "about", "portfolio"}
    for url, label, page_type in extract_links(base_url, home_html):
        if page_type not in relevant_types or url in seen_links:
            continue
        seen_links.add(url)
        internal_links.append({"url": url, "pageType": page_type, "label": label[:80], "audited": url in audited_urls})
        if len(internal_links) >= MAX_INTERNAL_LINKS:
            break

    colors: list[str] = []
    seen_colors: set[str] = set()
    for match in INLINE_STYLE_COLOR_RE.finditer(home_html or ""):
        value = match.group(0).lower()
        if value not in seen_colors:
            seen_colors.add(value)
            colors.append(value)
        if len(colors) >= MAX_COLORS:
            break

    return {"headings": headings, "claims": claims, "internalLinks": internal_links, "colors": colors}


def build_enrichment_candidates(
    base_url: str,
    home: FetchResult,
    all_pages: list[FetchResult],
    urls_reviewed: list[dict[str, Any]] | None = None,
    profile: str = "",
    business_name: str = "",
) -> dict[str, Any]:
    urls_reviewed = urls_reviewed or [{"url": home.final_url or home.url, "pageType": "home", "selectedReason": "home_page"}]
    warnings: list[str] = []
    if not home.ok or not home.html:
        return {
            "status": "failed",
            "contactCandidates": {"phones": [], "emails": [], "whatsappLinks": [], "addresses": [], "socialLinks": []},
            "assetCandidates": {"favicons": [], "logos": [], "openGraphImages": [], "twitterImages": [], "heroImages": [], "propertyImages": [], "allImages": [], "discardedImages": []},
            "brandSignals": {"title": "", "description": "", "headings": [], "claims": [], "internalLinks": [], "colors": []},
            "pageDiscovery": {"pagesReviewed": 0, "urlsReviewed": []},
            "warnings": ["enrichment_skipped_home_unreachable"],
            "rawSource": {"url": base_url, "finalUrl": home.final_url, "httpStatus": home.status},
        }

    combined_html = "\n".join(page.html for page in all_pages if page.html)
    combined_text = plain_text(combined_html)

    phones = extract_phone_candidates(combined_text)
    emails = extract_email_candidates(combined_text)
    whatsapp_links = extract_whatsapp_candidates(combined_html)
    addresses = extract_address_candidates(combined_html, combined_text)
    social_links = extract_social_candidates(combined_html)

    favicons = extract_favicon_candidates(base_url, home.html)
    logos = extract_logo_candidates(base_url, home.html, business_name)
    og_images = extract_og_image_candidates(base_url, home.html)
    twitter_images = extract_twitter_image_candidates(base_url, home.html)

    excluded = {c["url"] for c in favicons + logos + og_images + twitter_images}
    profile_for_images = profile or vertical_profile("", "", combined_text)
    page_commercial_type = {item["url"]: item["pageType"] for item in urls_reviewed}
    hero_images, property_images, all_images, discarded_images = classify_remaining_images(
        base_url, all_pages, page_commercial_type, excluded, profile_for_images
    )

    title = first_match(r"<title[^>]*>(.*?)</title>", home.html)[:180]
    description = first_match(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', home.html)
    if not description:
        description = first_match(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']', home.html)
    brand = extract_brand_signals(base_url, home.html, all_pages)

    # Per-page counts for pageDiscovery.urlsReviewed (Fase 7I-B B1).
    pages_by_url = {(page.final_url or page.url): page for page in all_pages}
    enriched_urls_reviewed: list[dict[str, Any]] = []
    for item in urls_reviewed:
        page = pages_by_url.get(item["url"])
        if page is None:
            page = next((p for p in all_pages if p.url == item["url"]), None)
        image_count = 0
        contact_count = 0
        http_status = page.status if page else 0
        if page and page.html:
            image_count = sum(
                1 for img in (extract_img_tags(page.html) + extract_background_images(page.html) + extract_direct_image_links(page.html))
                if not is_discardable_image(img["src"], img.get("alt", ""), img.get("class", ""), img.get("id", ""))[0]
            )
            page_text = plain_text(page.html)
            contact_count = (
                len(extract_phone_candidates(page_text))
                + len(extract_email_candidates(page_text))
                + len(extract_whatsapp_candidates(page.html))
                + len(extract_social_candidates(page.html))
            )
        enriched_urls_reviewed.append({
            "url": item["url"],
            "pageType": item["pageType"],
            "selectedReason": item.get("selectedReason", ""),
            "httpStatus": http_status,
            "imageCandidateCount": image_count,
            "contactSignalCount": contact_count,
        })

    if not phones:
        warnings.append("enrichment_no_phone_candidates")
    if not emails:
        warnings.append("enrichment_no_email_candidates")
    if not (favicons or logos or og_images or twitter_images):
        warnings.append("enrichment_no_image_candidates")
    if not logos:
        warnings.append("enrichment_no_logo_candidates_found")
    if not social_links:
        warnings.append("enrichment_no_social_links_found")

    has_any_contact = bool(phones or emails or whatsapp_links or addresses or social_links)
    has_any_asset = bool(favicons or logos or og_images or twitter_images or hero_images or property_images)
    status = "complete" if (has_any_contact and has_any_asset) else ("partial" if (has_any_contact or has_any_asset) else "empty")

    return {
        "status": status,
        "contactCandidates": {
            "phones": phones,
            "emails": emails,
            "whatsappLinks": whatsapp_links,
            "addresses": addresses,
            "socialLinks": social_links,
        },
        "assetCandidates": {
            "favicons": favicons,
            "logos": logos,
            "openGraphImages": og_images,
            "twitterImages": twitter_images,
            "heroImages": hero_images,
            "propertyImages": property_images,
            "allImages": all_images,
            "discardedImages": discarded_images,
        },
        "brandSignals": {
            "title": title,
            "description": description[:240],
            "headings": brand["headings"],
            "claims": brand["claims"],
            "internalLinks": brand["internalLinks"],
            "colors": brand["colors"],
        },
        "pageDiscovery": {
            "pagesReviewed": len(all_pages),
            "urlsReviewed": enriched_urls_reviewed,
        },
        "warnings": warnings,
        "rawSource": {"url": base_url, "finalUrl": home.final_url, "httpStatus": home.status},
    }


def audit_website(payload: dict[str, Any]) -> dict[str, Any]:
    input_url = normalize_url(str(payload.get("website") or ""))
    if not input_url:
        return {"ok": False, "error": "Lead sin web valida.", "hint": "Anade una URL http/https antes de auditar."}

    lead_id = str(payload.get("leadId") or "")
    business_name = str(payload.get("businessName") or "")
    vertical = str(payload.get("vertical") or "")
    city = str(payload.get("city") or "")
    province = str(payload.get("province") or "")
    profile = vertical_profile(vertical, business_name)
    base_url = home_url(input_url)

    home = fetch_page(base_url, "home")
    profile = vertical_profile(vertical, business_name, plain_text(home.html or ""))
    pages, urls_reviewed = select_pages_to_audit(input_url, home, profile)

    combined_html = "\n".join(page.html for page in pages if page.html)
    signals, vertical_signals, evidence = evidence_from_pages(pages)
    title = first_match(r"<title[^>]*>(.*?)</title>", home.html)
    meta_description = first_match(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', home.html)
    if not meta_description:
        meta_description = first_match(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']', home.html)
    html_lang = first_match(r'<html[^>]+lang=["\']([^"\']+)["\']', home.html)
    reachable = any(page.ok for page in pages)
    final_url = home.final_url or base_url

    base_payload = {
        "reachable": reachable,
        "httpStatus": home.status,
        "usesHttps": urlparse(final_url).scheme == "https",
        "loadTimeMs": home.load_time_ms,
        "title": title[:180],
        "metaDescription": meta_description[:240],
        "language": html_lang,
        "htmlSize": len(combined_html),
        "pagesAudited": len(pages),
        "auditedUrls": [page.final_url or page.url for page in pages],
        "pageTypesAudited": [page.page_type for page in pages],
        "technologySignals": technology_signals(combined_html),
        "signals": signals,
        "verticalSignals": vertical_signals,
    }
    recommendation = score_and_recommend(base_payload, profile)
    enrichment_candidates = build_enrichment_candidates(base_url, home, pages, urls_reviewed, profile, business_name)
    audit = {
        "auditVersion": "3.3",
        "status": "success" if reachable else "failed",
        "inputUrl": input_url,
        "baseUrl": base_url,
        **base_payload,
        "pages": [page_summary(page) for page in pages],
        "verticalProfile": profile,
        "labels": PROFILE_LABELS.get(profile, PROFILE_LABELS["generic"]),
        "evidence": evidence,
        "hasTitle": signals["hasTitle"],
        "hasMetaDescription": signals["hasMetaDescription"],
        "hasViewport": signals["hasViewport"],
        "hasPhone": signals["hasPhone"],
        "hasEmail": signals["hasEmail"],
        "hasWhatsapp": signals["hasWhatsapp"],
        "hasContactForm": signals["hasContactForm"],
        "hasClearCTA": signals["hasClearCTA"],
        "hasPropertyListings": signals["hasPropertyListings"],
        "hasVirtualTourSignals": signals["hasVirtualTourSignals"],
        "hasVideoSignals": signals["hasVideoSignals"],
        "hasSocialLinks": signals["hasSocialLinks"],
        **recommendation,
        "error": "" if reachable else (home.error or "No se pudo acceder a la web."),
        "enrichmentCandidates": enrichment_candidates,
    }
    return {
        "ok": True,
        "leadId": lead_id,
        "website": input_url,
        "finalUrl": final_url,
        "auditedAt": datetime.now(timezone.utc).isoformat(),
        "audit": audit,
    }
