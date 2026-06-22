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
MAX_PAGES = 4
TIMEOUT_SECONDS = 8
USER_AGENT = "ImmersphereProLocalAudit/3.2 (+local controlled B2B audit)"

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


def select_pages_to_audit(input_url: str, homepage_html: str, profile: str) -> list[dict[str, str]]:
    normalized = normalize_url(input_url)
    base = home_url(normalized)
    pages: list[dict[str, str]] = [{"url": base, "pageType": "home"}]

    if normalized and normalized != base and same_domain(base, normalized) and not is_excluded_url(normalized):
        add_unique_page(pages, normalized, page_type_for_url(normalized), base)

    links = extract_links(base, homepage_html)
    wanted = ["contact", "portfolio", "services"]
    if profile == "real_estate":
        wanted.append("listings")
    elif profile in {"interior_design", "architecture", "construction"}:
        wanted = ["contact", "portfolio", "services"]
    elif profile == "hospitality":
        wanted = ["contact", "services", "portfolio"]

    for page_type in wanted:
        found = next((url for url, _label, kind in links if kind == page_type), "")
        if found:
            add_unique_page(pages, found, page_type, base)
        if len(pages) >= MAX_PAGES:
            break
    return pages[:MAX_PAGES]


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
WHATSAPP_HREF_PATTERN = re.compile(r'href=["\']([^"\']*(?:wa\.me|api\.whatsapp\.com)[^"\']*)["\']', re.I)
SOCIAL_HREF_PATTERN = re.compile(
    r'href=["\']([^"\']*(?:instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|twitter\.com|x\.com|pinterest\.com)[^"\']*)["\']',
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
HEADING_RE = re.compile(r"(?is)<(h1|h2)\b[^>]*>(.*?)</\1>")
INLINE_STYLE_COLOR_RE = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")


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


def extract_img_tags(page_html: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for m in IMG_TAG_RE.finditer(page_html or ""):
        attrs = m.group(1)
        src = attr_value(attrs, "src") or attr_value(attrs, "data-src")
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
    return out


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


def extract_logo_candidates(base_url: str, page_html: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for img in extract_img_tags(page_html):
        haystack = " ".join([img["src"], img["alt"], img["class"], img["id"]])
        if not LOGO_HINT_RE.search(haystack):
            continue
        url = absolute_asset_url(base_url, img["src"])
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(image_candidate(url, "website_html", "medium", reason="img src/alt/class/id matched logo|brand|marca", alt=img["alt"], recommended_use="logo"))
        if len(out) >= MAX_LOGOS:
            break
    return out


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


def classify_remaining_images(base_url: str, pages_html: list[str], excluded_urls: set[str], profile: str) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    """Returns (heroImages, propertyImages, allImages) from <img> tags not
    already claimed as favicon/logo/og/twitter candidates. Hero detection is
    a best-effort heuristic (declared width/height or hero/banner hints) —
    we never download images to inspect real dimensions."""
    hero: list[dict[str, str]] = []
    property_imgs: list[dict[str, str]] = []
    all_imgs: list[dict[str, str]] = []
    seen: set[str] = set()
    is_real_estate = profile == "real_estate"
    property_hint_re = re.compile(r"propiedad|inmueble|vivienda|villa|piso|apartamento|casa|property", re.I)

    for page_html in pages_html:
        for img in extract_img_tags(page_html):
            url = absolute_asset_url(base_url, img["src"])
            if not url or url in excluded_urls or url in seen:
                continue
            seen.add(url)

            if len(all_imgs) < MAX_ALL_IMAGES:
                all_imgs.append(image_candidate(url, "website_html", "low", reason="img src found on page", alt=img["alt"], recommended_use="unknown"))

            haystack = " ".join([img["src"], img["alt"], img["class"], img["id"]])
            width = int(img["width"]) if img["width"].isdigit() else 0
            height = int(img["height"]) if img["height"].isdigit() else 0
            looks_large = width >= 400 or height >= 300
            looks_hero = bool(HERO_HINT_RE.search(haystack)) or looks_large
            looks_property = is_real_estate and bool(property_hint_re.search(haystack))

            if looks_hero and len(hero) < MAX_HERO_IMAGES:
                reason = "class/id/alt matched hero|banner|cover" if HERO_HINT_RE.search(haystack) else "declared width/height suggests a large image"
                hero.append(image_candidate(url, "website_html", "medium" if HERO_HINT_RE.search(haystack) else "low", reason=reason, alt=img["alt"], recommended_use="hero"))
            elif looks_property and len(property_imgs) < MAX_PROPERTY_IMAGES:
                property_imgs.append(image_candidate(url, "website_html", "low", reason="img src/alt matched property-related keywords", alt=img["alt"], recommended_use="property"))

    return hero, property_imgs, all_imgs


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


def build_enrichment_candidates(base_url: str, home: FetchResult, all_pages: list[FetchResult]) -> dict[str, Any]:
    warnings: list[str] = []
    if not home.ok or not home.html:
        return {
            "status": "failed",
            "contactCandidates": {"phones": [], "emails": [], "whatsappLinks": [], "addresses": [], "socialLinks": []},
            "assetCandidates": {"favicons": [], "logos": [], "openGraphImages": [], "twitterImages": [], "heroImages": [], "propertyImages": [], "allImages": []},
            "brandSignals": {"title": "", "description": "", "headings": [], "claims": [], "internalLinks": [], "colors": []},
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
    logos = extract_logo_candidates(base_url, home.html)
    og_images = extract_og_image_candidates(base_url, home.html)
    twitter_images = extract_twitter_image_candidates(base_url, home.html)

    excluded = {c["url"] for c in favicons + logos + og_images + twitter_images}
    profile_for_images = vertical_profile("", "", combined_text)
    hero_images, property_images, all_images = classify_remaining_images(
        base_url, [page.html for page in all_pages if page.html], excluded, profile_for_images
    )

    title = first_match(r"<title[^>]*>(.*?)</title>", home.html)[:180]
    description = first_match(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', home.html)
    if not description:
        description = first_match(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']', home.html)
    brand = extract_brand_signals(base_url, home.html, all_pages)

    if not phones:
        warnings.append("enrichment_no_phone_candidates")
    if not emails:
        warnings.append("enrichment_no_email_candidates")
    if not (favicons or logos or og_images or twitter_images):
        warnings.append("enrichment_no_image_candidates")
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
        },
        "brandSignals": {
            "title": title,
            "description": description[:240],
            "headings": brand["headings"],
            "claims": brand["claims"],
            "internalLinks": brand["internalLinks"],
            "colors": brand["colors"],
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
    selected = select_pages_to_audit(input_url, home.html if home.ok else "", profile)
    pages: list[FetchResult] = [home]
    for item in selected[1:]:
        pages.append(fetch_page(item["url"], item["pageType"]))

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
    enrichment_candidates = build_enrichment_candidates(base_url, home, pages)
    audit = {
        "auditVersion": "3.2",
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
