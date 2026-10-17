"""Serve the built SvelteKit SPA (adapter-static) from KELVIN_WEB, next to the API."""

import base64
import hashlib
import mimetypes
import re
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse

from kelvin.errors import UserError

IMMUTABLE = "public, max-age=31536000, immutable"
# Every method reaches the catch-all, so an unknown /api route is a 404 for all of them
# (a GET-only catch-all made POST /api/unknown a 405).
METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


def _is_api(path: str) -> bool:
    """Paths the SPA never serves: the API, anything under /mcp, and /.well-known (an MCP
    client probing for OAuth metadata gets a JSON 404, not index.html)."""
    return path in ("api", "mcp", ".well-known") or path.startswith(
        ("api/", "mcp/", ".well-known/")
    )


# adapter-static writes .br and .gz next to each text asset (precompress): send the smallest one
# the browser accepts, never decompressing on the fly.
ENCODINGS = (("br", ".br"), ("gzip", ".gz"))


def _accepts(header: str, coding: str) -> bool:
    """True when Accept-Encoding names `coding` with a non-zero q (names and q are case-blind)."""
    for part in header.split(","):
        name, *params = part.split(";")
        if name.strip().lower() != coding:
            continue
        for param in params:
            key, _, value = param.strip().partition("=")
            if key.strip().lower() == "q":
                try:
                    return float(value.strip()) > 0
                except ValueError:
                    return False
        return True
    return False


# Inline classic scripts of the page (app.html's and SvelteKit's bootstrap); a <script src> or a
# JSON data block is not one.
INLINE_SCRIPT = re.compile(r"<script(\s[^>]*)?>(.*?)</script>", re.S | re.I)
# Inline event handler attributes (onclick=…): the policy allows none, so the page must hold none.
INLINE_HANDLER = re.compile(r"<[^>]+\son[a-z]+\s*=", re.I)


def content_security_policy(index_html: str) -> str:
    """The page's Content-Security-Policy: scripts only from Kelvin itself plus the exact inline
    scripts of this build (by SHA-256, computed from the served index.html, so a rebuild needs
    no change here). Styles allow inline: Svelte sets style attributes and transition rules.
    Nothing is loaded from, sent to or framed by another origin."""
    hashes = []
    for attrs, body in INLINE_SCRIPT.findall(index_html):
        if "src=" in (attrs or "") or "application/json" in (attrs or ""):
            continue
        digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
        hashes.append(f"'sha256-{digest}'")
    return "; ".join(
        (
            "default-src 'self'",
            " ".join(("script-src 'self'", *dict.fromkeys(hashes))),
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "worker-src 'self'",
            "manifest-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        )
    )


def _file(
    path: Path, request: Request, cache: str, extra: dict[str, str] | None = None
) -> FileResponse:
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = {"Cache-Control": cache, "Vary": "Accept-Encoding", **(extra or {})}
    accept = request.headers.get("accept-encoding", "")
    for coding, suffix in ENCODINGS:
        packed = path.with_name(path.name + suffix)
        if _accepts(accept, coding) and packed.is_file():
            headers["Content-Encoding"] = coding
            return FileResponse(packed, media_type=media_type, headers=headers)
    return FileResponse(path, media_type=media_type, headers=headers)


def mount_web(app: FastAPI, web_dir: Path | None) -> None:
    if web_dir is None or not (web_dir / "index.html").is_file():
        return
    root = web_dir.resolve()
    index = root / "index.html"
    page = index.read_text(encoding="utf-8")
    if INLINE_HANDLER.search(INLINE_SCRIPT.sub("", page)):
        raise RuntimeError(f"{index} has an inline event handler, which the CSP would block")
    page_headers = {"Content-Security-Policy": content_security_policy(page)}

    @app.api_route("/{path:path}", methods=METHODS, include_in_schema=False)
    async def spa(request: Request, path: str) -> FileResponse:
        if _is_api(path):
            raise UserError("not_found", 404)
        if request.method not in ("GET", "HEAD"):
            raise UserError("method_not_allowed", 405)
        if path:
            try:
                candidate = (root / path).resolve()
            except (OSError, ValueError):  # a NUL byte, a name too long
                raise UserError("not_found", 404) from None
            # Inside the build first, then the file: nothing outside the build is even stat'ed.
            # The .br/.gz copies are only ever sent as an encoding of their original.
            packed = candidate.suffix in (".br", ".gz")
            if packed and candidate.is_file():
                raise UserError("not_found", 404)
            if candidate.is_relative_to(root) and candidate.is_file():
                cache = IMMUTABLE if "/immutable/" in f"/{path}" else "no-cache"
                extra = page_headers if candidate == index else None
                return _file(candidate, request, cache, extra)
        return _file(index, request, "no-cache", page_headers)
