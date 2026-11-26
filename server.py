"""Local HTTP server for the Hessen fishing exam practice platform."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT_DIR = Path(__file__).resolve().parent
WEB_DIR = ROOT_DIR / "web"
QUESTIONS_MANIFEST = ROOT_DIR / "hessen_pruefungsfragen.json"
DEFAULT_PORT = 8765


class AppHandler(BaseHTTPRequestHandler):
    """HTTP handler serving ./web/* and /api/questions."""

    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def send_json(self, payload: object, status: int = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, file_path: Path) -> None:
        if not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        data = file_path.read_bytes()
        mime_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        req_path = unquote(urlparse(self.path).path)
        if req_path == "/api/questions":
            questions = json.loads(QUESTIONS_MANIFEST.read_text(encoding="utf-8"))
            self.send_json(questions)
            return

        if req_path in ("/", ""):
            req_path = "/index.html"

        target = (WEB_DIR / req_path.lstrip("/")).resolve()
        if target != WEB_DIR.resolve() and WEB_DIR.resolve() not in target.parents:
            self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")
            return
        self.send_file(target)


def main() -> int:
    port = int(os.environ.get("PORT", DEFAULT_PORT))
    server = ThreadingHTTPServer(("127.0.0.1", port), AppHandler)
    print(f"Fischerprüfung Hessen Probeklausur läuft auf http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
