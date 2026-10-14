"""Serve the built SvelteKit SPA (adapter-static) from KELVIN_WEB, next to the API."""

import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

IMMUTABLE = "public, max-age=31536000, immutable"
# Every method reaches the catch-all, so an unknown /api route is a 404 for all of them
# (a GET-only catch-all made POST /api/unknown a 405).
METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


def _is_api(path: str) -> bool:
    return path == "api" or path.startswith("api/")


# adapter-static writes .br and .gz next to each text asset (precompress): send the smallest one
# the browser accepts, never decompressing on the fly.
ENCODINGS = (("br", ".br"), ("gzip", ".gz"))


def _accepts(header: str, coding: str) -> bool:
    for part in header.split(","):
        name, _, params = part.strip().partition(";")
        if name.strip().lower() == coding:
            return params.replace(" ", "") not in ("q=0", "q=0.0")
    return False


def _file(path: Path, request: Request, cache: str) -> FileResponse:
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = {"Cache-Control": cache, "Vary": "Accept-Encoding"}
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

    @app.api_route("/{path:path}", methods=METHODS, include_in_schema=False)
    async def spa(request: Request, path: str) -> FileResponse:
        if _is_api(path):
            raise HTTPException(404, "Introuvable.")
        if request.method not in ("GET", "HEAD"):
            raise HTTPException(405, "Méthode non autorisée.")
        if path:
            try:
                candidate = (root / path).resolve()
            except (OSError, ValueError):  # a NUL byte, a name too long
                raise HTTPException(404, "Introuvable.") from None
            # Inside the build first, then the file: nothing outside the build is even stat'ed.
            if candidate.is_relative_to(root) and candidate.is_file():
                cache = IMMUTABLE if "/immutable/" in f"/{path}" else "no-cache"
                return _file(candidate, request, cache)
        return _file(index, request, "no-cache")
