"""Production entry point: `python -m kelvin` (the Docker image's CMD).

It runs uvicorn with the app factory and Kelvin's own network policy:
- X-Forwarded-* headers are ignored unless KELVIN_TRUSTED_PROXIES lists the reverse proxy's
  addresses. Trusting them from anyone would let any client pick its IP (bypassing the per-IP
  login throttle) and claim HTTPS (the session cookie's Secure flag). A wildcard is refused.
- Every file Kelvin creates is private to its user (umask 077): kelvin.db and its WAL hold
  session hashes and the home's history.
- A data directory it cannot write, or an account file it cannot read, stops it with one line
  instead of a traceback.
"""

from __future__ import annotations

import ipaddress
import os
import sys
import tempfile
from typing import Any

import uvicorn
from pydantic import ValidationError

from kelvin.account import AccountFileError, AccountStore
from kelvin.config import Settings, split_list

APP = "kelvin.api.app:create_app"


class ConfigError(Exception):
    """A setting or the data directory makes starting unsafe or impossible."""


_IPV4_MAPPED = ipaddress.ip_network("::ffff:0:0/96")


def _too_broad(network: ipaddress.IPv4Network | ipaddress.IPv6Network) -> bool:
    """Networks so wide they amount to a wildcard: IPv4 shorter than /8, IPv6 shorter than /16,
    or anything containing the IPv4-mapped range (it embeds all of IPv4)."""
    if network.version == 4:
        return network.prefixlen < 8
    return network.prefixlen < 16 or network.supernet_of(_IPV4_MAPPED)  # type: ignore[arg-type]


def trusted_proxies(raw: str) -> list[str]:
    items = split_list(raw)
    for item in items:
        if item == "*":
            raise ConfigError(
                "KELVIN_TRUSTED_PROXIES='*' would let any client fake its address and HTTPS; "
                "list your reverse proxy's addresses instead"
            )
        try:
            network = ipaddress.ip_network(item, strict=True)
        except ValueError as e:
            raise ConfigError(
                f"KELVIN_TRUSTED_PROXIES: {item!r} is not an IP address or a network ({e})"
            ) from None
        if _too_broad(network):
            raise ConfigError(
                f"KELVIN_TRUSTED_PROXIES: {item!r} is too broad (it amounts to trusting "
                "everyone); list your reverse proxy's addresses instead"
            )
    return items


def uvicorn_options(settings: Settings) -> dict[str, Any]:
    proxies = trusted_proxies(settings.kelvin_trusted_proxies)
    options: dict[str, Any] = {
        "app": APP,
        "factory": True,
        "host": settings.kelvin_host,
        "port": settings.kelvin_port,
        # Off unless configured: uvicorn's own default trusts 127.0.0.1 and reads
        # FORWARDED_ALLOW_IPS, which a stray env var could set to '*'.
        "proxy_headers": bool(proxies),
        "server_header": False,
    }
    if proxies:
        options["forwarded_allow_ips"] = ",".join(proxies)
    return options


def preflight(settings: Settings) -> None:
    data = settings.kelvin_data
    try:
        data.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(dir=data):
            pass
    except OSError as e:
        raise ConfigError(
            f"KELVIN_DATA={data} is not writable by uid {os.getuid()} ({e.strerror}). "
            "Give the directory to that user. For a Docker volume or bind mount: "
            "docker run --rm -u 0 -v kelvin_data:/data <image> chown -R 10001:10001 /data"
        ) from None
    try:
        AccountStore(data).load()
    except AccountFileError as e:
        raise ConfigError(str(e)) from None
    except OSError as e:
        # Path and error type only: never the file's content.
        raise ConfigError(
            f"cannot read {data / 'account.json'} ({type(e).__name__}); "
            "check its owner and mode (0600)"
        ) from None


def main() -> int:
    os.umask(0o077)
    try:
        settings = Settings()
        options = uvicorn_options(settings)
        preflight(settings)
    except (ConfigError, ValidationError) as e:
        print(f"kelvin: {e}", file=sys.stderr)
        return 2
    uvicorn.run(**options)
    return 0
