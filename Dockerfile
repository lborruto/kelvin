# syntax=docker/dockerfile:1

# Base images are pinned by digest. Resolved on 2026-10-14 with
# `docker buildx imagetools inspect <tag>` (multi-arch index digests, amd64 + arm64):
#   node:24-trixie-slim          sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
#   python:3.13-slim-trixie      sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f
#   ghcr.io/astral-sh/uv:0.12.18 sha256:3adc3706091ce7c2fe595e669628caedd6d951551b92b258b7e7dbe06d9440bc

# --- web: the SvelteKit PWA, built static ---------------------------------------------
FROM node:24-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY web/svelte.config.js web/vite.config.ts web/tsconfig.json ./
COPY web/src ./src
COPY web/static ./static
RUN npm run build

# --- backend: a locked, non-editable virtualenv -----------------------------------------
FROM python:3.13-slim-trixie@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f AS backend
COPY --from=ghcr.io/astral-sh/uv:0.12.18@sha256:3adc3706091ce7c2fe595e669628caedd6d951551b92b258b7e7dbe06d9440bc /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /src
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY backend/kelvin ./kelvin
# --reinstall-package: uv caches the wheel it builds from this local project keyed on
# pyproject.toml, not on the sources, so a warm cache mount would install stale Kelvin code.
# Dependencies keep the cache; only the project is rebuilt from the copied sources.
# uv leaves its lock file world-writable (0666): it has no use at runtime.
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-editable --reinstall-package kelvin \
 && rm -f /app/.venv/.lock

# --- runtime ------------------------------------------------------------------------------
FROM python:3.13-slim-trixie@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f
LABEL org.opencontainers.image.title="Kelvin" \
      org.opencontainers.image.description="Self-hosted control for Sauter Cozytouch radiators (Overkiz), with Linky energy" \
      org.opencontainers.image.licenses="MIT"
RUN groupadd --system --gid 10001 kelvin \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent \
      --shell /usr/sbin/nologin kelvin \
 && install -d -o 10001 -g 10001 -m 0700 /data
COPY --from=backend /app/.venv /app/.venv
COPY --from=web /web/build /app/web
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/licenses/kelvin/
COPY --from=web /web/node_modules/@fontsource-variable/geist/LICENSE /usr/share/licenses/kelvin/fonts/Geist-OFL-1.1.txt
COPY --from=web /web/node_modules/@fontsource/jetbrains-mono/LICENSE /usr/share/licenses/kelvin/fonts/JetBrainsMono-OFL-1.1.txt
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    KELVIN_DATA=/data \
    KELVIN_WEB=/app/web \
    KELVIN_HOST=0.0.0.0 \
    KELVIN_PORT=8080 \
    TZ=Europe/Paris
WORKDIR /app
USER 10001:10001
VOLUME ["/data"]
EXPOSE 8080
# /api/health answers 200 in every mode (ok, degraded, setup, reauth, offline): the container
# is healthy while Kelvin serves, even when Cozytouch is down or waiting for a login.
# 127.0.0.1 always passes the Host allowlist (KELVIN_ALLOWED_HOSTS).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["python", "-c", "import os, sys, urllib.request; port = os.environ.get('KELVIN_PORT', '8080'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=4).status == 200 else 1)"]
CMD ["python", "-m", "kelvin"]
