#!/usr/bin/env python
"""
Local Scraper Bridge for Immersphere Pro CRM.

Runs only on 127.0.0.1 and exposes a tiny API for the local HTML CRM.
It does not bypass CAPTCHA, does not use proxies, and does not contact leads.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from run import OUTPUTS_DIR, RESPONSIBLE_WARNING, SearchPlan, clamp_limit, generate_query_variants, output_base, scrape_plan, write_outputs


HOST = "127.0.0.1"
PORT = 8765
ALLOWED_ORIGIN_PREFIXES = (
    "http://localhost",
    "http://127.0.0.1",
    "https://juanmaes83.github.io",
    "file://",
)


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    set_cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(body)


def set_cors_headers(handler: BaseHTTPRequestHandler) -> None:
    origin = handler.headers.get("Origin", "")
    if not origin or any(origin.startswith(prefix) for prefix in ALLOWED_ORIGIN_PREFIXES):
        handler.send_header("Access-Control-Allow-Origin", origin or "*")
    else:
        handler.send_header("Access-Control-Allow-Origin", "null")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def plan_from_payload(payload: dict[str, Any]) -> SearchPlan:
    return SearchPlan(
        id=str(payload.get("searchPlanId") or payload.get("id") or ""),
        query=str(payload.get("query") or "").strip(),
        vertical=str(payload.get("vertical") or "").strip(),
        city=str(payload.get("city") or "").strip(),
        province=str(payload.get("province") or "").strip(),
        area=str(payload.get("area") or "").strip(),
        limit=clamp_limit(payload.get("limit") or 5),
        source="google_maps_scraper",
        priority=str(payload.get("priority") or "B").strip(),
        status=str(payload.get("status") or "Pendiente").strip(),
        expand_queries=bool(payload.get("expandQueries") or payload.get("expand_queries")),
    )


def dry_run_payload(plan: SearchPlan) -> dict[str, Any]:
    base = output_base(plan)
    return {
        "ok": True,
        "dryRun": True,
        "query": plan.query,
        "count": 0,
        "csvPath": str(base.with_suffix(".csv")),
        "jsonPath": str(base.with_suffix(".json")),
        "results": [],
        "totalRawFound": 0,
        "totalAfterDedupe": 0,
        "queryVariantsUsed": generate_query_variants(plan),
        "lowRelevanceCount": 0,
        "warning": RESPONSIBLE_WARNING,
    }


def list_outputs() -> list[dict[str, Any]]:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    for path in sorted(OUTPUTS_DIR.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True):
        if path.name == ".gitkeep" or not path.is_file():
            continue
        items.append(
            {
                "name": path.name,
                "path": str(path),
                "size": path.stat().st_size,
                "modified": path.stat().st_mtime,
            }
        )
    return items


class Handler(BaseHTTPRequestHandler):
    server_version = "ImmersphereLocalScraper/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print("[local-scraper]", fmt % args)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        set_cors_headers(self)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "status": "ok",
                    "service": "immersphere-local-google-maps-scraper",
                    "host": HOST,
                    "port": PORT,
                },
            )
            return
        if path == "/outputs":
            json_response(self, 200, {"ok": True, "outputs": list_outputs()})
            return
        json_response(self, 404, {"ok": False, "error": "Endpoint no encontrado."})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/run":
            json_response(self, 404, {"ok": False, "error": "Endpoint no encontrado."})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            plan = plan_from_payload(payload)
            if not plan.query:
                raise ValueError("Falta query.")
            if payload.get("dryRun"):
                json_response(self, 200, dry_run_payload(plan))
                return
            print(RESPONSIBLE_WARNING)
            print(f"Ejecutando busqueda local: {plan.query} (limite {plan.limit})")
            outcome = scrape_plan(
                plan,
                delay=float(payload.get("delay") or 1.8),
                headless=bool(payload.get("headless", True)),
            )
            csv_path, json_path = write_outputs(plan, outcome.results)
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "query": plan.query,
                    "count": len(outcome.results),
                    "totalRawFound": outcome.total_raw_found,
                    "totalAfterDedupe": outcome.total_after_dedupe,
                    "queryVariantsUsed": outcome.query_variants_used,
                    "lowRelevanceCount": outcome.low_relevance_count,
                    "csvPath": str(csv_path),
                    "jsonPath": str(json_path),
                    "results": [asdict(item) for item in outcome.results],
                },
            )
        except Exception as exc:
            json_response(
                self,
                500,
                {
                    "ok": False,
                    "error": str(exc),
                    "hint": "Revisa Playwright, conexion, CAPTCHA/bloqueo o cambios de DOM. No se intenta evadir bloqueos.",
                },
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="Immersphere local scraper bridge")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, args.port), Handler)
    print(f"Local Scraper Bridge activo en http://{HOST}:{args.port}")
    print(RESPONSIBLE_WARNING)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
