#!/usr/bin/env python
"""
Controlled website opportunity audit for Immersphere Pro CRM.

Local-only helper. It fetches at most a homepage plus one clear contact page
and one clear property/listings page from the same domain. It does not submit
forms, log in, bypass blocking, run Lighthouse, or capture screenshots.
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
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


MAX_HTML_CHARS = 750_000
MAX_PAGES = 3
TIMEOUT_SECONDS = 8
USER_AGENT = "ImmersphereProLocalAudit/1.0 (+local controlled B2B audit)"


@dataclass
class FetchResult:
    url: str
    final_url: str
    ok: bool
    status: int
    html: str
    load_time_ms: int
    error: str = ""


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
    return parsed.geturl()


def same_domain(a: str, b: str) -> bool:
    pa, pb = urlparse(a), urlparse(b)
    host_a = pa.netloc.lower().removeprefix("www.")
    host_b = pb.netloc.lower().removeprefix("www.")
    return bool(host_a and host_a == host_b)


def fetch_page(url: str) -> FetchResult:
    started = time.perf_counter()
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS, context=ssl.create_default_context()) as response:
            raw = response.read(MAX_HTML_CHARS)
            charset = response.headers.get_content_charset() or "utf-8"
            body = raw.decode(charset, errors="replace")
            return FetchResult(
                url=url,
                final_url=response.geturl(),
                ok=True,
                status=int(getattr(response, "status", 200) or 200),
                html=body,
                load_time_ms=round((time.perf_counter() - started) * 1000),
            )
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read(MAX_HTML_CHARS).decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return FetchResult(
            url=url,
            final_url=exc.geturl() or url,
            ok=False,
            status=int(exc.code or 0),
            html=body,
            load_time_ms=round((time.perf_counter() - started) * 1000),
            error=str(exc),
        )
    except (TimeoutError, URLError, OSError) as exc:
        return FetchResult(
            url=url,
            final_url=url,
            ok=False,
            status=0,
            html="",
            load_time_ms=round((time.perf_counter() - started) * 1000),
            error=str(exc),
        )


def first_match(pattern: str, text: str, flags: int = re.I | re.S) -> str:
    match = re.search(pattern, text or "", flags)
    return html.unescape(match.group(1)).strip() if match else ""


def extract_links(base_url: str, page_html: str) -> list[tuple[str, str]]:
    links: list[tuple[str, str]] = []
    for match in re.finditer(r'(?is)<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', page_html or ""):
        href = html.unescape(match.group(1)).strip()
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        absolute = urljoin(base_url, href)
        if same_domain(base_url, absolute):
            label = plain_text(match.group(2)).lower()
            links.append((absolute.split("#")[0], label))
    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    for url, label in links:
        if url not in seen:
            seen.add(url)
            unique.append((url, label))
    return unique


def pick_internal_pages(base_url: str, page_html: str) -> list[str]:
    links = extract_links(base_url, page_html)
    picks: list[str] = []
    buckets = [
        r"contact|contacto|about|empresa|equipo",
        r"propiedad|propiedades|inmueble|inmuebles|venta|alquiler|buy|rent|properties|property|villas|homes",
    ]
    for pattern in buckets:
        found = next((url for url, label in links if re.search(pattern, (url + " " + label).lower())), "")
        if found and found not in picks:
            picks.append(found)
        if len(picks) >= MAX_PAGES - 1:
            break
    return picks[: MAX_PAGES - 1]


def has_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, re.I) for pattern in patterns)


def technology_signals(page_html: str) -> list[str]:
    lower = (page_html or "").lower()
    signals = []
    checks = {
        "wordpress": "wp-content" in lower or "wp-json" in lower,
        "elementor": "elementor" in lower,
        "wix": "wixstatic" in lower or "wix.com" in lower,
        "squarespace": "squarespace" in lower,
        "webflow": "webflow" in lower,
        "shopify": "shopify" in lower,
    }
    for name, ok in checks.items():
        if ok:
            signals.append(name)
    return signals


def score_and_recommend(payload: dict[str, Any], vertical: str, business_name: str, city: str) -> dict[str, Any]:
    signals = payload["signals"]
    weaknesses: list[str] = []
    opportunities: list[str] = []
    score = 0
    text = " ".join([vertical, business_name, city]).lower()
    real_estate = has_any(text, [r"inmobili", r"real estate", r"property", r"villas?", r"promotor"])
    premium = signals["hasPremiumSignals"] or has_any(text, [r"premium", r"luxury", r"lujo", r"villa", r"altea", r"costa blanca"])

    if payload["reachable"]:
        score += 20
    else:
        weaknesses.append("Web inaccesible o no disponible en la muestra analizada.")
        opportunities.append("Proponer landing/ficha inmersiva básica antes de una campaña.")
        return {
            "weaknesses": weaknesses,
            "opportunities": opportunities,
            "websiteOpportunityScore": 65,
            "recommendedService": "Landing inmersiva básica + ficha comercial 360",
            "recommendedNextAction": "Validar web/contacto y preparar propuesta de presencia visual mínima.",
            "confidence": "baja",
        }

    if not payload["usesHttps"]:
        score += 10
        weaknesses.append("No se confirma HTTPS en la URL final.")
    if not signals["hasViewport"]:
        score += 8
        weaknesses.append("No se detecta viewport responsive en la muestra HTML.")
    if not signals["hasMetaDescription"]:
        score += 5
        weaknesses.append("Meta description ausente o no detectada.")
    if not signals["hasClearCTA"]:
        score += 10
        weaknesses.append("Falta de CTA claro detectado.")
        opportunities.append("Añadir CTA de visita, WhatsApp o solicitud de información en activos visuales.")
    if not signals["hasWhatsapp"]:
        score += 8
        weaknesses.append("No se detecta WhatsApp visible.")
    if not signals["hasContactForm"]:
        score += 8
        weaknesses.append("No se detecta formulario de contacto visible.")
    if not signals["hasVirtualTourSignals"]:
        score += 15
        weaknesses.append("No se detectan tours virtuales/360 en la muestra analizada.")
        opportunities.append("Crear tour 360 comercial con hotspots y CTA dentro del recorrido.")
    else:
        score -= 15
        opportunities.append("Revisar si los tours existentes captan leads o solo muestran contenido.")
    if signals["hasPropertyListings"]:
        score += 12
        opportunities.append("Convertir propiedades destacadas en experiencias inmersivas con medición.")
    if signals["hasVideoSignals"]:
        score += 4
        opportunities.append("Conectar vídeo existente con landing/tour/CTA para captación.")
    if payload["loadTimeMs"] >= 3500:
        score += 8
        weaknesses.append("Carga básica lenta en la muestra analizada.")
    if real_estate:
        score += 10
    if premium:
        score += 10
        opportunities.append("Usar propiedad premium como demo piloto de alto impacto.")
    if signals["hasGenericPortalSignals"]:
        score += 6
        opportunities.append("Reducir dependencia de portales con activos propios reutilizables.")
    if signals["hasClearCTA"] and signals["hasWhatsapp"] and signals["hasContactForm"] and signals["hasVirtualTourSignals"]:
        score -= 12

    score = max(0, min(100, score))
    recommended_service = "Website Opportunity Audit + tour 360 comercial"
    if real_estate:
        recommended_service = "Pack Inmobiliaria 360: tour, hotspots, landing y captación"
    if not signals["hasVirtualTourSignals"] and signals["hasPropertyListings"]:
        recommended_service = "Demo de propiedad destacada con tour 360 y CTA"
    recommended_next = "Revisar web y elegir un activo destacado para preparar demo visual."
    if not signals["hasClearCTA"]:
        recommended_next = "Preparar propuesta de CTA inmersivo y formulario de lead dentro del tour."
    if not signals["hasPhone"] and not signals["hasEmail"]:
        recommended_next = "Verificar contacto antes de preparar acercamiento manual."

    confidence = "alta" if payload["pagesAudited"] >= 2 else "media"
    if payload["htmlSize"] < 800:
        confidence = "baja"

    return {
        "weaknesses": weaknesses,
        "opportunities": opportunities,
        "websiteOpportunityScore": score,
        "recommendedService": recommended_service,
        "recommendedNextAction": recommended_next,
        "confidence": confidence,
    }


def audit_website(payload: dict[str, Any]) -> dict[str, Any]:
    website = normalize_url(str(payload.get("website") or ""))
    if not website:
        return {"ok": False, "error": "Lead sin web válida.", "hint": "Añade una URL http/https antes de auditar."}

    lead_id = str(payload.get("leadId") or "")
    business_name = str(payload.get("businessName") or "")
    vertical = str(payload.get("vertical") or "")
    city = str(payload.get("city") or "")
    province = str(payload.get("province") or "")

    first = fetch_page(website)
    pages = [first]
    if first.html and first.ok:
        for url in pick_internal_pages(first.final_url, first.html):
            if len(pages) >= MAX_PAGES:
                break
            pages.append(fetch_page(url))

    combined_html = "\n".join(page.html for page in pages if page.html)
    combined_text = plain_text(combined_html).lower()
    title = first_match(r"<title[^>]*>(.*?)</title>", first.html)
    meta_description = first_match(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', first.html)
    if not meta_description:
        meta_description = first_match(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']', first.html)
    html_lang = first_match(r'<html[^>]+lang=["\']([^"\']+)["\']', first.html)
    lower_html = combined_html.lower()

    signals = {
        "hasTitle": bool(title),
        "hasMetaDescription": bool(meta_description),
        "hasViewport": bool(re.search(r'<meta[^>]+name=["\']viewport["\']', first.html or "", re.I)),
        "hasPhone": bool(re.search(r"(\+?\d[\d\s()./-]{7,}\d)", combined_text)),
        "hasEmail": bool(re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", combined_text, re.I)),
        "hasWhatsapp": has_any(lower_html + " " + combined_text, [r"whatsapp", r"wa\.me", r"api\.whatsapp"]),
        "hasContactForm": bool(re.search(r"(?is)<form\b", combined_html)) or has_any(combined_text, [r"formulario", r"contact form"]),
        "hasClearCTA": has_any(combined_text, [r"contactar", r"llamar", r"reservar", r"solicitar visita", r"pedir informacion", r"request information", r"book a viewing", r"schedule"]),
        "hasPropertyListings": has_any(combined_text, [r"propiedades", r"inmuebles", r"viviendas", r"venta", r"alquiler", r"for sale", r"properties", r"villas", r"apartments"]),
        "hasVirtualTourSignals": has_any(lower_html + " " + combined_text, [r"matterport", r"tour virtual", r"virtual tour", r"360", r"recorrido virtual", r"visita virtual"]),
        "hasVideoSignals": has_any(lower_html, [r"youtube", r"vimeo", r"<video", r"youtu\.be"]),
        "hasSocialLinks": has_any(lower_html, [r"instagram\.com", r"facebook\.com", r"linkedin\.com", r"tiktok\.com", r"youtube\.com"]),
        "hasGenericPortalSignals": has_any(lower_html + " " + combined_text, [r"idealista", r"fotocasa", r"habitaclia", r"kyero", r"thinkspain"]),
        "hasPremiumSignals": has_any(combined_text, [r"premium", r"luxury", r"lujo", r"villa", r"villas", r"sea view", r"costa blanca", r"altea hills"]),
    }

    reachable = any(page.ok for page in pages)
    final_url = first.final_url or website
    base_payload = {
        "reachable": reachable,
        "httpStatus": first.status,
        "usesHttps": urlparse(final_url).scheme == "https",
        "loadTimeMs": first.load_time_ms,
        "title": title[:180],
        "metaDescription": meta_description[:240],
        "language": html_lang,
        "htmlSize": len(combined_html),
        "pagesAudited": len(pages),
        "auditedUrls": [page.final_url or page.url for page in pages],
        "technologySignals": technology_signals(combined_html),
        "signals": signals,
    }
    recommendation = score_and_recommend(base_payload, vertical, business_name, city or province)
    audit = {
        **base_payload,
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
        "error": "" if reachable else (first.error or "No se pudo acceder a la web."),
    }
    return {
        "ok": True,
        "leadId": lead_id,
        "website": website,
        "finalUrl": final_url,
        "auditedAt": datetime.now(timezone.utc).isoformat(),
        "audit": audit,
    }
