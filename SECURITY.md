# Security policy

## Reporting a vulnerability

Please report privately through GitHub: **Security › Report a vulnerability**
(https://github.com/lborruto/kelvin/security/advisories/new). Do not open a public issue.
Include the version (Maison › Version or the image tag), what an attacker needs (network
position, an account, a session), and the steps. Kelvin is maintained in spare time: reports are handled on a best-effort basis, with no guaranteed response time.

## Supported versions

`main`. Kelvin is a small self-hosted project: fixes land on `main` and in the image built
from it.

## Security model

- Kelvin's login is the home's Cozytouch account, checked against Cozytouch. Kelvin stores that
  email and password in `$KELVIN_DATA/account.json` (mode 0600) because it must re-login to
  Overkiz unattended. Treat the data volume like a password store.
- Sessions are a random token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored.
  Logins are throttled per client IP and globally.
- Kelvin is meant for a LAN or a VPN (such as Tailscale). It serves plain HTTP and must not be
  exposed to the internet.
- Forwarded headers are ignored unless `KELVIN_TRUSTED_PROXIES` lists your reverse proxy.
- The container runs as uid 10001 with a read-only root filesystem in the example compose file.

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
