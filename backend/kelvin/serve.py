"""Production entry point: `python -m kelvin` (the Docker image's CMD).

It runs uvicorn with the app factory and Kelvin's own network policy:
- X-Forwarded-* headers are ignored unless KELVIN_TRUSTED_PROXIES lists the reverse proxy's
  addresses. Trusting them from anyone would let any client pick its IP (bypassing the per-IP
  login throttle) and claim HTTPS (the session cookie's Secure flag). A wildcard is refused.
- Every file Kelvin creates is private to its user (umask 077): kelvin.db and its WAL hold
  session hashes and the home's history.
- A data directory it cannot write, an account file it cannot read, a data folder that holds
  another Overkiz server's home, or the simulator pointed at a real installation's data, stops
  it with one line instead of a traceback.
- Listening beyond loopback with no Host allowlist prints a warning: whoever reaches an
  unclaimed Kelvin first can claim the home, and any host name is accepted.
"""

from __future__ import annotations

import ipaddress
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

import uvicorn
from pydantic import ValidationError

from kelvin.account import AccountFileError, AccountStore
from kelvin.config import Settings, split_list
from kelvin.overkiz.servers import server_name
from kelvin.recorder.db import Database

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
        account = AccountStore(data).load()
    except AccountFileError as e:
        raise ConfigError(str(e)) from None
    except OSError as e:
        # Path and error type only: never the file's content.
        raise ConfigError(
            f"cannot read {data / 'account.json'} ({type(e).__name__}); "
            "check its owner and mode (0600)"
        ) from None
    # The server the start would use: the account file's, else the env bootstrap's.
    if account is not None:
        server: str | None = account.server
    elif settings.cozy_user.strip() and settings.cozy_pass.get_secret_value():
        server = settings.cozy_server
    else:
        server = None  # setup mode: the first login decides (data_other_server)
    if settings.kelvin_fake and _holds_a_real_home(data):
        # The reverse of start_runtime's refusal of simulator data: simulated readings must
        # never mix into a real installation's history.
        raise ConfigError(
            f"KELVIN_DATA={data} holds readings from a real installation; the simulator "
            "(KELVIN_FAKE=1) needs its own data folder (with Docker Compose: another "
            "KELVIN_VOLUME)."
        )
    held = _held_server(data)
    if server is not None and held is not None and held != server:
        # The same refusal start_runtime makes (DataServerMismatch), as one clean line and
        # before any Overkiz call; no email, product names only.
        raise ConfigError(
            f"KELVIN_DATA={data} holds the home of another Overkiz server ({server_name(held)}) "
            f"while the account is on {server_name(server)}. Switching server is a fresh "
            "install: use another KELVIN_DATA folder."
        )


def _holds_a_real_home(data: Path) -> bool:
    """True when kelvin.db holds readings the simulator did not write (no sim mark)."""
    if not (data / "kelvin.db").exists():
        return False
    from kelvin.overkiz.simhistory import SIM_DB_KEY  # the API stack: loaded for this one read

    db = Database(data / "kelvin.db")
    try:
        if db.get_setting(SIM_DB_KEY) is True:
            return False
        return bool(
            db.query("SELECT 1 FROM samples LIMIT 1") or db.query("SELECT 1 FROM energy LIMIT 1")
        )
    finally:
        db.close()


def _held_server(data: Path) -> str | None:
    """The Overkiz server whose home the data folder holds (kelvin.db), None when unknown."""
    if not (data / "kelvin.db").exists():
        return None
    from kelvin.api.runtime import SERVER_KEY  # the API stack: loaded for this one read

    db = Database(data / "kelvin.db")
    try:
        held = db.get_setting(SERVER_KEY)
    finally:
        db.close()
    return held if isinstance(held, str) else None


LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def is_loopback(host: str) -> bool:
    """A bind address or a Host header name (no port) that only this machine can use."""
    host = host.strip().strip("[]").lower()
    if host in LOOPBACK_HOSTS:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def exposure_warning(settings: Settings) -> str | None:
    """The warning a start prints when Kelvin listens beyond loopback with no Host allowlist."""
    if split_list(settings.kelvin_allowed_hosts) or is_loopback(settings.kelvin_host):
        return None
    return (
        f"WARNING: Kelvin listens on {settings.kelvin_host} and KELVIN_ALLOWED_HOSTS is empty. "
        "If other machines can reach this port, whoever opens an unclaimed Kelvin first can "
        "claim the home with their own Cozytouch account, and any host name is accepted (DNS "
        "rebinding). Set KELVIN_ALLOWED_HOSTS to the names and addresses you use "
        "(e.g. kelvin.lan,192.168.1.10) and keep Kelvin on your LAN or VPN. Under Docker "
        "Compose this is fine while KELVIN_BIND stays 127.0.0.1 (the default)."
    )


def main() -> int:
    os.umask(0o077)
    try:
        settings = Settings()
        options = uvicorn_options(settings)
        preflight(settings)
    except (ConfigError, ValidationError) as e:
        print(f"kelvin: {e}", file=sys.stderr)
        return 2
    warning = exposure_warning(settings)
    if warning:
        print(f"kelvin: {warning}", file=sys.stderr)
    uvicorn.run(**options)
    return 0
