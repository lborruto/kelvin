# Security policy

## Reporting a vulnerability

Please report privately through GitHub: **Security › Report a vulnerability**
(https://github.com/lborruto/kelvin/security/advisories/new). Do not open a public issue.
Include the version (at the bottom of « Réglages », or the image tag), what an attacker
needs (network position, an account, a session), and the steps. Kelvin is maintained in spare time: reports are handled on a best-effort basis, with no guaranteed response time.

## Supported versions

`main`. Kelvin is a small self-hosted project: fixes land on `main` and in the image built
from it.

## Security model

Read this before installing.

- **Login is your home's account on its Overkiz server** (Sauter Cozytouch by default; choose
  another at the first login). Kelvin has no users of its own: it checks the email and password
  against that server. The first login on a fresh install decides which
  account the install belongs to. Anyone who can log in to Cozytouch with that account can log
  in to Kelvin. Logins are throttled per client (5 failures per 15 min) and overall.
- **Sessions:** every signed-in browser is listed in Settings › Account › Signed-in devices (browser
  and system only; the raw user agent and the session token never leave the server). Signing a
  device out takes effect on its next request and closes its live stream within 30 seconds.
- **Kelvin stores that password** in `/data/account.json` (mode 0600), because it must
  re-login to Cozytouch unattended. Protect and back up the data volume like a password store.
- **Keep it on your LAN or a VPN** such as Tailscale or WireGuard. Kelvin serves plain HTTP.
  **Never expose it directly to the internet** or forward a router port to it.
- **Reverse proxy:** `X-Forwarded-*` headers are ignored by default. Only behind a reverse
  proxy you control, set `KELVIN_TRUSTED_PROXIES` to that proxy's exact address. `*` and
  wildcard-sized networks are refused: they would let any client fake its IP (dodging the login
  throttle) and HTTPS.
- **Host allowlist (recommended):** set `KELVIN_ALLOWED_HOSTS` in `.env` to the host names and
  addresses you use to reach Kelvin (for example `kelvin.lan,192.168.1.10`), before the first
  login. Kelvin then refuses requests for any other host name. This blocks DNS rebinding, where
  a hostile web page you visit reaches Kelvin through your browser (to try logins or, on a
  fresh install, to claim it). `localhost` and `127.0.0.1` always pass.
- **What leaves your home for grid signals:** Kelvin asks MyElectricalData's public Tempo and
  EcoWatt endpoints for dates only: no token, no PDL, nothing about your consumption. There is no
  other grid source.
- The image runs as uid 10001; the example compose file adds a read-only root filesystem, no
  capabilities and `no-new-privileges`.
- **Session cookie:** a session is a random token in an HttpOnly, SameSite=Lax cookie; only its
  SHA-256 is stored.

## In scope

The backend API, the login and session handling, the login throttle, the handling of
secrets (`account.json`, the Cozytouch password and the Linky token), the web app, the Docker
image and the example compose file, and the GitHub workflows.

## Out of scope

- The Overkiz / Cozytouch cloud, MyElectricalData and Enedis themselves: report to them.
- Deployments exposed to the internet, against the README's advice, or behind a proxy trusted
  with `*`.
- Attacks that need a shell on the host, access to the data volume, or a logged-in session's
  cookie.
- Denial of service by request volume from the LAN.
- Vulnerabilities in dependencies with no Kelvin-specific way to reach them: report them
  upstream.
