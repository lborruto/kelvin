"""Cozytouch setup writes (spec §2.7, §9.4): an allowlist of five writes and two targeted reads,
sent once each through the pyoverkiz client's own authenticated session.

pyoverkiz 2.2.2 reads places but cannot write them, and its `_post`/`_put`/`_delete` helpers do
not fit: `check_response` accepts only 200 and 204 (place creation answers 201), and
`retry_on_connection_failure` re-sends a POST after a dropped connection (a second room). So
every request is built here, matched against ALLOWED by `check_allowed`, and sent once. Every
other setup operation (device delete, _deleteCascade, firmware, metadata, deviceType,
controllables, persistent states, place re-parenting, the bulk reads) raises SetupNotAllowed
before a byte is sent. The private pyoverkiz surface used here is pinned by the exact
`pyoverkiz==2.2.2` dependency and by tests/test_setup_client.py.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable
from typing import Any
from urllib.parse import quote, unquote

import aiohttp
from pyoverkiz import exceptions as ox
from pyoverkiz.response_handler import check_response
from yarl import URL

from kelvin.overkiz.errors import GatewayError, SetupNotFoundError


class SetupNotAllowed(Exception):
    """A setup request outside the allowlist: a bug in Kelvin, never sent."""


# Device sub-operation words. A label equal to one of them (any case) would address that
# operation: `PUT /setup/devices/{url}/metadata` updates metadata, `…/updateFirmware` flashes.
RESERVED_SEGMENTS = frozenset(
    s.casefold()
    for s in (
        "metadata",
        "relocate",
        "states",
        "deviceType",
        "alternativeControllables",
        "equivalentControllables",
        "firmwareUpToDate",
        "firmwareUpdateCapability",
        "updateFirmware",
        "updateFirmwares",
        "manufacturerReferences",
        "attributes",
        "controllable",
        "controllables",
        "additionalInformation",
        "subSystems",
        "_delete",
        "_deleteCascade",
        "link",
        "refresh",
        "notUpToDate",
        "hidden",
    )
)

_SEG = r"([^/?#]+)"
ALLOWED: tuple[tuple[str, str, re.Pattern[str]], ...] = (
    ("read_place", "GET", re.compile(rf"setup/places/{_SEG}")),
    ("read_device", "GET", re.compile(rf"setup/devices/{_SEG}")),
    ("create_place", "POST", re.compile(rf"setup/places/{_SEG}/subPlaces")),
    ("update_place", "PUT", re.compile(rf"setup/places/{_SEG}")),
    ("delete_place", "DELETE", re.compile(rf"setup/places/{_SEG}")),
    ("relocate_device", "PUT", re.compile(rf"setup/devices/{_SEG}/relocate/{_SEG}")),
    ("rename_device", "PUT", re.compile(rf"setup/devices/{_SEG}/{_SEG}\?updateDeviceName=false")),
)


def _plain(value: str) -> None:
    if not value.strip() or set(value) <= {"."}:
        raise SetupNotAllowed("empty or dot-only path segment")


def segment(value: str) -> str:
    """One path segment, percent-encoded: device URLs hold `://`, `/` and `#`."""
    _plain(value)
    return quote(value, safe="")


def place_path(oid: str) -> str:
    return f"setup/places/{segment(oid)}"


def subplaces_path(parent_oid: str) -> str:
    return f"setup/places/{segment(parent_oid)}/subPlaces"


def device_path(device_url: str) -> str:
    return f"setup/devices/{segment(device_url)}"


def relocate_path(device_url: str, place_oid: str) -> str:
    return f"{device_path(device_url)}/relocate/{segment(place_oid)}"


def label_path(device_url: str, label: str) -> str:
    """`PUT /setup/devices/{url}/{label}`; updateDeviceName=false sets the Cozytouch label only
    (spec ruling 4)."""
    if label.strip().casefold() in RESERVED_SEGMENTS:
        raise SetupNotAllowed("a device label may not name a device operation")
    return f"{device_path(device_url)}/{segment(label)}?updateDeviceName=false"


def check_allowed(method: str, path: str) -> str:
    """The operation `method path` is, or SetupNotAllowed. Runs before every setup request."""
    for name, allowed_method, pattern in ALLOWED:
        match = pattern.fullmatch(path)
        if allowed_method != method or match is None:
            continue
        decoded = [unquote(g) for g in match.groups()]
        for value in decoded:
            _plain(value)
        if name == "rename_device" and decoded[1].strip().casefold() in RESERVED_SEGMENTS:
            raise SetupNotAllowed("a device label may not name a device operation")
        return name
    raise SetupNotAllowed(f"{method} is not an allowed setup operation on this path")


class SetupHttp:
    """Sends one allowlisted setup request through a logged-in pyoverkiz client. No retry:
    a write that may have reached Cozytouch is confirmed by reading, never re-sent."""

    def __init__(
        self,
        client: Callable[[], Any],
        *,
        timeout: float,
        map_error: Callable[[BaseException], GatewayError],
    ) -> None:
        self._client = client
        self._timeout = timeout
        self._map_error = map_error

    async def request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> tuple[int, Any]:
        check_allowed(method, path)
        c = self._client()
        try:
            async with asyncio.timeout(self._timeout):
                await c._refresh_token_if_expired()
                headers = dict(await c._auth.auth_headers(path))
                url = URL(f"{c._auth.endpoint}{path}", encoded=True)
                async with c.session.request(
                    method, url, json=payload, headers=headers, ssl=c._ssl
                ) as resp:
                    if resp.status == 404:
                        raise SetupNotFoundError("not found")
                    if resp.status in (200, 201, 204):
                        body = None if resp.status == 204 else await resp.json(content_type=None)
                        return resp.status, body
                    await check_response(resp)  # raises the typed pyoverkiz error
                    raise ox.OverkizError(f"unexpected status {resp.status}")
        except SetupNotFoundError:
            raise
        except ox.UnknownObjectError as e:  # 400 "Unknown object": the oid or URL is gone
            raise SetupNotFoundError("not found") from e
        except (ox.BaseOverkizError, aiohttp.ClientError, TimeoutError) as e:
            raise self._map_error(e) from e
