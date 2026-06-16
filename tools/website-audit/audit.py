#!/usr/bin/env python
"""
Controlled website opportunity audit for Immersphere Pro CRM.

Fase 3.1:
- Always audits the domain home, even when the input URL is an internal page.
- Adds at most three extra same-domain key pages.
- Adapts labels, signals, scoring and recommendations by vertical.

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
USER_AGENT = "ImmersphereProLocalAudit/3.1 (+local controlled B2B audit)"

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
    audit = {
        "auditVersion": "3.1",
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
    }
    return {
        "ok": True,
        "leadId": lead_id,
        "website": input_url,
        "finalUrl": final_url,
        "auditedAt": datetime.now(timezone.utc).isoformat(),
        "audit": audit,
    }
