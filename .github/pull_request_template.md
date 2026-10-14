## What and why

## How it was checked

- [ ] backend: `cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
- [ ] web: `cd web && npx vitest run && npm run check && npx playwright test`
- [ ] image (Dockerfile, compose or launcher changes): `bash scripts/docker-smoke.sh`
- [ ] device behaviour changed: verified on my own radiator, reverted, and recorded in `docs/overkiz-notes.md`

## Checklist

- [ ] No credentials, ids, serials, emails or household data in code, tests, docs or screenshots
- [ ] UI copy in French, following `DESIGN.md`
