"""Minimal test for the local bridge's CORS / Private Network Access headers.

Covers the fix for: a public HTTPS origin (GitHub Pages) calling this
127.0.0.1-bound bridge was blocked by Chrome's Private Network Access
policy because the preflight response lacked
Access-Control-Allow-Private-Network. Run with:
    python -m unittest tools/google-maps-scraper/test_server_cors.py
"""

from __future__ import annotations

import http.client
import threading
import unittest
from http.server import ThreadingHTTPServer

from server import HOST, Handler


class CorsPreflightTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer((HOST, 0), Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def _preflight(self, origin: str) -> http.client.HTTPResponse:
        conn = http.client.HTTPConnection(HOST, self.port, timeout=5)
        conn.request(
            "OPTIONS",
            "/audit-website",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        resp = conn.getresponse()
        resp.read()
        conn.close()
        return resp

    def test_allowed_origin_gets_private_network_header(self) -> None:
        resp = self._preflight("https://juanmaes83.github.io")
        self.assertIn(resp.status, (200, 204))
        self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), "https://juanmaes83.github.io")
        self.assertEqual(resp.getheader("Access-Control-Allow-Private-Network"), "true")
        self.assertEqual(resp.getheader("Vary"), "Origin")
        self.assertIn("OPTIONS", resp.getheader("Access-Control-Allow-Methods") or "")

    def test_disallowed_origin_does_not_get_private_network_header(self) -> None:
        resp = self._preflight("https://evil-site.example.com")
        self.assertIn(resp.status, (200, 204))
        self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), "null")
        self.assertIsNone(resp.getheader("Access-Control-Allow-Private-Network"))

    def test_localhost_origin_allowed(self) -> None:
        resp = self._preflight("http://localhost:5500")
        self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), "http://localhost:5500")
        self.assertEqual(resp.getheader("Access-Control-Allow-Private-Network"), "true")


if __name__ == "__main__":
    unittest.main()
