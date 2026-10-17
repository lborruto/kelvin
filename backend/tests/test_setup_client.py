"""Setup client (spec §2.7, §9.4): the allowlist, percent-encoding, one request each, errors."""

import asyncio
import importlib.metadata
import inspect
import json

import aiohttp
import pytest
from pyoverkiz.auth.credentials import UsernamePasswordCredentials
from pyoverkiz.client import OverkizClient
from pyoverkiz.enums import Server

from kelvin.overkiz.errors import AuthError, GatewayError, QuotaError, SetupNotFoundError
from kelvin.overkiz.models import SetupDevice, SetupPlace
from kelvin.overkiz.real import PyOverkizGateway, _map_error
from kelvin.setup.client import (
    ALLOWED,
    SetupHttp,
    SetupNotAllowed,
    check_allowed,
    device_path,
    label_path,
    place_path,
    relocate_path,
    segment,
    subplaces_path,
)

URL = "io://1234-5678-9012/10000001#1"
ENC = "io%3A%2F%2F1234-5678-9012%2F10000001%231"
ROOT = "https://stub.example/enduser-mobile-web/enduserAPI/"


class _Resp:
    def __init__(self, status: int, body=None, *, hang: bool = False, raw: str | None = None):
        self.status = status
        self._body = body
        self.hang = hang
        self.raw = raw  # a non-JSON body (a proxy's HTML page): json() raises like aiohttp's
        self.url = ROOT

    async def json(self, content_type=None):
        if self.raw is not None:
            return json.loads(self.raw)
        return self._body

    async def text(self):
        return self.raw if self.raw is not None else json.dumps(self._body)

    async def __aenter__(self):
        if self.hang:
            await asyncio.sleep(10)
        return self

    async def __aexit__(self, *exc):
        return False


class _Session:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls: list[tuple[str, object, object]] = []
        self.redirects: list[bool] = []

    def request(self, method, url, *, json=None, headers=None, ssl=None, allow_redirects=True):
        self.calls.append((method, url, json))
        self.redirects.append(allow_redirects)
        r = self.responses.pop(0)
        if isinstance(r, BaseException):
            raise r
        return r


class _Auth:
    endpoint = ROOT

    async def auth_headers(self, path=None):
        return {"Authorization": "Bearer stub"}


class _Client:
    def __init__(self, session: _Session):
        self.session = session
        self._auth = _Auth()
        self._ssl = True
        self.refreshes = 0

    async def _refresh_token_if_expired(self):
        self.refreshes += 1


def _http(*responses, timeout: float = 5.0) -> tuple[SetupHttp, _Client]:
    client = _Client(_Session(*responses))
    return SetupHttp(lambda: client, timeout=timeout, map_error=_map_error), client


def test_segment_encodes_every_reserved_character():
    assert segment(URL) == ENC
    assert segment("p-salon") == "p-salon"


def test_a_label_with_a_slash_space_and_apostrophe_stays_one_segment():
    path = label_path(URL, "Salle d’eau / bureau")
    assert path == (
        f"setup/devices/{ENC}/Salle%20d%E2%80%99eau%20%2F%20bureau?updateDeviceName=false"
    )
    assert check_allowed("PUT", path) == "rename_device"


def test_the_allowlist_accepts_exactly_the_seven_operations():
    assert [name for name, _, _ in ALLOWED] == [
        "read_place",
        "read_device",
        "create_place",
        "update_place",
        "delete_place",
        "relocate_device",
        "rename_device",
    ]
    assert check_allowed("GET", place_path("p-salon")) == "read_place"
    assert check_allowed("GET", device_path(URL)) == "read_device"
    assert check_allowed("POST", subplaces_path("p-house")) == "create_place"
    assert check_allowed("PUT", place_path("p-salon")) == "update_place"
    assert check_allowed("DELETE", place_path("p-salon")) == "delete_place"
    assert check_allowed("PUT", relocate_path(URL, "p-salon")) == "relocate_device"
    assert check_allowed("PUT", label_path(URL, "Bureau")) == "rename_device"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "setup/places"),
        ("GET", "setup/devices"),
        ("GET", "setup"),
        ("DELETE", f"setup/devices/{ENC}"),
        ("POST", f"setup/devices/{ENC}/_delete"),
        ("POST", f"setup/devices/{ENC}/_deleteCascade"),
        ("PUT", f"setup/devices/{ENC}/updateFirmware"),
        ("PUT", f"setup/devices/{ENC}/updateFirmware?updateDeviceName=false"),
        ("PUT", f"setup/devices/{ENC}/metadata?updateDeviceName=false"),
        ("PUT", f"setup/devices/{ENC}/METADATA?updateDeviceName=false"),
        ("PUT", f"setup/devices/{ENC}/Bureau"),
        ("PUT", f"setup/devices/{ENC}/Bureau?updateDeviceName=true"),
        ("PUT", f"setup/devices/{ENC}/Bureau/subSystems"),
        ("PUT", f"setup/devices/{ENC}/deviceType/Other"),
        ("PUT", f"setup/devices/{ENC}/alternativeControllables/io%3AOther"),
        ("PUT", f"setup/devices/{ENC}/states/core%3ANameState/1/x"),
        ("PUT", "setup/places/p-salon/parent/p-house"),
        ("PUT", "setup/places/p-salon/p-house"),
        ("POST", "setup/places/p-house/Bureau/7"),
        ("POST", "setup/places/p-house/subPlaces/extra"),
        ("POST", "setup/devices/states/refresh"),
        ("PUT", "setup/devices/updateFirmwares"),
        ("GET", "setup/places/.."),
        ("GET", "setup/places/%2E%2E"),
        ("GET", "setup/places/p-salon?x=1"),
        ("PUT", f"setup/devices/{ENC}/..?updateDeviceName=false"),
        ("PUT", f"setup/devices/{ENC}/%2E?updateDeviceName=false"),
        ("DELETE", f"setup/devices/{ENC}/relocate/p-salon"),
        ("PATCH", "setup/places/p-salon"),
    ],
)
def test_the_allowlist_refuses_every_other_setup_operation(method, path):
    with pytest.raises(SetupNotAllowed):
        check_allowed(method, path)


@pytest.mark.parametrize(
    "label", ["metadata", "MetaData", "updateFirmware", "relocate", "..", ".", "", "   "]
)
def test_label_path_refuses_operation_words_dots_and_blanks(label):
    with pytest.raises(SetupNotAllowed):
        label_path(URL, label)


async def test_the_url_is_sent_as_encoded():
    http, client = _http(_Resp(201, {"placeOID": "p-new"}), _Resp(200, {"execId": "e"}))
    status, body = await http.request(
        "POST", subplaces_path("p-house"), {"type": 7, "label": "Bureau"}
    )
    assert (status, body) == (201, {"placeOID": "p-new"})
    await http.request("PUT", label_path(URL, "Salle d’eau / bureau"))
    (m1, u1, p1), (m2, u2, p2) = client.session.calls
    assert (m1, str(u1), p1) == (
        "POST",
        f"{ROOT}setup/places/p-house/subPlaces",
        {"type": 7, "label": "Bureau"},
    )
    assert m2 == "PUT" and p2 is None
    assert str(u2) == f"{ROOT}{label_path(URL, 'Salle d’eau / bureau')}"
    assert "%2F%2F" in u2.raw_path and "%E2%80%99" in u2.raw_path  # not re-quoted by yarl
    assert client.refreshes == 2


async def test_a_disallowed_request_sends_nothing():
    http, client = _http()
    with pytest.raises(SetupNotAllowed):
        await http.request("DELETE", f"setup/devices/{ENC}")
    assert client.session.calls == [] and client.refreshes == 0


async def test_one_request_and_no_retry_on_a_dropped_connection():
    http, client = _http(aiohttp.ServerDisconnectedError())
    with pytest.raises(GatewayError):
        await http.request("POST", subplaces_path("p-house"), {"type": 7, "label": "Bureau"})
    assert len(client.session.calls) == 1


@pytest.mark.parametrize(
    ("status", "body", "expected"),
    [
        (404, {"errorCode": "UNKNOWN_OBJECT", "error": "Unknown object"}, SetupNotFoundError),
        # Overkiz also answers an unknown oid with 400 "Unknown object".
        (400, {"errorCode": "UNSPECIFIED_ERROR", "error": "Unknown object"}, SetupNotFoundError),
        (400, {"errorCode": "QUOTA_EXCEEDED", "error": "Too many requests"}, QuotaError),
        (401, {"errorCode": "RESOURCE_ACCESS_DENIED", "error": "Not authenticated"}, AuthError),
        (400, {"errorCode": "UNSPECIFIED_ERROR", "error": "boom"}, GatewayError),
    ],
)
async def test_errors_map_like_commands(status, body, expected):
    http, _ = _http(_Resp(status, body))
    with pytest.raises(GatewayError) as e:
        await http.request("GET", place_path("p-salon"))
    assert type(e.value) is expected


@pytest.mark.parametrize("status", [200, 201])
async def test_a_non_json_success_body_is_a_gateway_error(status):
    http, _ = _http(_Resp(status, raw="<html>portal</html>"))
    with pytest.raises(GatewayError) as e:
        await http.request("GET", place_path("p-salon"))
    assert type(e.value) is GatewayError and "portal" not in str(e.value)


async def test_redirects_are_never_followed():
    """A 307/308 would re-send the write elsewhere; a 30x on POST would become an unchecked GET."""
    http, client = _http(_Resp(200, {}), _Resp(307, {"error": "moved"}))
    await http.request("GET", place_path("p-salon"))
    with pytest.raises(GatewayError):
        await http.request("POST", subplaces_path("p-house"), {"type": 7, "label": "Bureau"})
    assert client.session.redirects == [False, False] and len(client.session.calls) == 2


async def test_a_hung_request_times_out_as_a_gateway_error():
    http, _ = _http(_Resp(200, {}, hang=True), timeout=0.05)
    with pytest.raises(GatewayError):
        await http.request("GET", place_path("p-salon"))


async def test_the_private_pyoverkiz_surface_setup_http_uses_is_there():
    """SetupHttp relies on pyoverkiz internals; the exact pin and this test guard them."""
    from pyoverkiz import exceptions as ox
    from pyoverkiz.response_handler import check_response

    assert importlib.metadata.version("pyoverkiz") == "2.2.2"
    assert inspect.iscoroutinefunction(check_response)
    assert issubclass(ox.UnknownObjectError, ox.BaseOverkizError)
    client = OverkizClient(
        server=Server.SAUTER_COZYTOUCH,
        credentials=UsernamePasswordCredentials(username="a@example.invalid", password="x"),
    )
    try:
        assert inspect.iscoroutinefunction(client._refresh_token_if_expired)
        assert inspect.iscoroutinefunction(client._auth.auth_headers)
        assert isinstance(client._auth.endpoint, str) and client._auth.endpoint.endswith("/")
        assert callable(client.session.request)
        assert hasattr(client, "_ssl")
    finally:
        await client.close()


async def test_the_real_gateway_sends_the_documented_requests():
    session = _Session(
        _Resp(201, {"placeOID": "p-new"}),
        _Resp(200, {"oid": "p-new", "label": "Bureau", "type": 7, "subPlaces": []}),
        _Resp(200, None),
        _Resp(204),
        _Resp(200, None),
        _Resp(200, {"execId": "e"}),
        _Resp(200, {"deviceURL": URL, "label": "Radiateur", "placeOID": "p-salon"}),
    )
    gw = PyOverkizGateway("a@example.invalid", "x")
    gw._client = _Client(session)  # type: ignore[assignment]
    assert await gw.create_place("p-house", "Bureau", 7) == "p-new"
    assert await gw.read_place("p-new") == SetupPlace("p-new", "Bureau", 7, None, ())
    await gw.update_place("p-new", "Bureau 2", 7, None)
    await gw.delete_place("p-new")
    await gw.relocate_device(URL, "p-salon")
    await gw.rename_device(URL, "Radiateur")
    assert await gw.read_device(URL) == SetupDevice(URL, "Radiateur", "p-salon")
    sent = [(m, str(u).removeprefix(ROOT), body) for m, u, body in session.calls]
    assert sent == [
        ("POST", "setup/places/p-house/subPlaces", {"type": 7, "label": "Bureau"}),
        ("GET", "setup/places/p-new", None),
        ("PUT", "setup/places/p-new", {"type": 7, "label": "Bureau 2"}),
        ("DELETE", "setup/places/p-new", None),
        ("PUT", f"setup/devices/{ENC}/relocate/p-salon", None),
        ("PUT", f"setup/devices/{ENC}/Radiateur?updateDeviceName=false", None),
        ("GET", f"setup/devices/{ENC}", None),
    ]


async def test_a_created_place_without_an_oid_is_an_error():
    gw = PyOverkizGateway("a@example.invalid", "x")
    gw._client = _Client(_Session(_Resp(201, {})))  # type: ignore[assignment]
    with pytest.raises(GatewayError):
        await gw.create_place("p-house", "Bureau", 7)
