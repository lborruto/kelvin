"""The Overkiz servers Kelvin offers (Plan 12): pyoverkiz's own ids and names."""

import aiohttp
import pytest
from pydantic import ValidationError
from pyoverkiz.auth.credentials import UsernamePasswordCredentials
from pyoverkiz.auth.factory import build_auth_strategy
from pyoverkiz.const import SUPPORTED_SERVERS
from pyoverkiz.enums import Server

from kelvin.api.runtime import SERVER_KEY, DataServerMismatch, start_runtime, stop_runtime
from kelvin.config import Settings
from kelvin.errors import UserError
from kelvin.house.model import build_house
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.real import PyOverkizGateway
from kelvin.overkiz.sample import sample_house
from kelvin.overkiz.servers import (
    DEFAULT_SERVER,
    SERVERS,
    is_cozytouch,
    server_info,
    server_name,
)
from kelvin.recorder.db import Database
from kelvin.setup.service import SetupService
from tests.conftest import ManualClock


def test_the_cozytouch_servers_come_first_with_sauter_the_default():
    ids = list(SERVERS)
    assert ids[:3] == ["sauter_cozytouch", "atlantic_cozytouch", "thermor_cozytouch"]
    assert DEFAULT_SERVER == Server.SAUTER_COZYTOUCH.value
    assert [SERVERS[i].name for i in ids[:3]] == [
        "Sauter Cozytouch",
        "Atlantic Cozytouch",
        "Thermor Cozytouch",
    ]
    assert all(SERVERS[i].tier == "cozytouch" for i in ids[:3])
    assert SERVERS[DEFAULT_SERVER].view() == {
        "id": "sauter_cozytouch",
        "name": "Sauter Cozytouch",
        "tier": "cozytouch",
        "default": True,
    }


def test_experimental_servers_are_the_other_email_and_password_logins():
    experimental = [i for i, s in SERVERS.items() if s.tier == "experimental"]
    assert experimental == [
        "somfy_europe",
        "somfy_america",
        "somfy_oceania",
        "hi_kumo_europe",
        "hi_kumo_asia",
        "hi_kumo_oceania",
        "flexom",
        "nexity",
        "brandt",
        "hexaom_hexaconnect",
        "simu_livein2",
        "ubiwizz",
    ]
    # Left out on purpose: an OAuth code flow, a multi-site account, a local API.
    for left_out in ("rexel", "somfy", "somfy_developer_mode"):
        assert left_out not in SERVERS


def test_ids_and_names_are_pyoverkiz_s_own():
    for sid, info in SERVERS.items():
        assert Server(sid).value == sid
        assert info.name == SUPPORTED_SERVERS[Server(sid)].name


async def test_every_offered_server_logs_in_with_an_email_and_a_password():
    creds = UsernamePasswordCredentials(username="demo@kelvin.local", password="kelvin")
    async with aiohttp.ClientSession() as session:
        for sid in SERVERS:
            # Raises TypeError when the server needs another kind of credentials. No request.
            build_auth_strategy(
                server_config=SUPPORTED_SERVERS[Server(sid)],
                credentials=creds,
                session=session,
                ssl_context=True,
            )


def test_lookups():
    assert server_info("nope") is None
    assert is_cozytouch("thermor_cozytouch") and not is_cozytouch("flexom")
    assert not is_cozytouch("nope")
    assert server_name("flexom") == "Flexom" and server_name("nope") == "nope"


def test_the_default_setting_is_sauter_and_an_unknown_one_is_refused(monkeypatch):
    assert Settings(_env_file=None).cozy_server == "sauter_cozytouch"
    monkeypatch.setenv("COZY_SERVER", "atlantic_cozytouch")
    assert Settings(_env_file=None).cozy_server == "atlantic_cozytouch"
    monkeypatch.setenv("COZY_SERVER", "rexel")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


# Task 3: a gateway per server; the data folder is bound to its server.


async def test_the_real_gateway_talks_to_its_server():
    creds = UsernamePasswordCredentials(username="a@b.fr", password="pw")
    for sid, name in (("sauter_cozytouch", "Sauter Cozytouch"), ("flexom", "Flexom")):
        gw = PyOverkizGateway("a@b.fr", "pw", server=sid)
        assert gw.server == sid
        client = gw._client_for(creds)  # builds the client; no request is sent
        try:
            assert client.server_config.name == name
        finally:
            await client.close()
    assert PyOverkizGateway("a@b.fr", "pw").server == "sauter_cozytouch"


def test_the_fake_gateway_carries_its_server():
    assert FakeGateway().server == "sauter_cozytouch"
    assert FakeGateway(server="atlantic_cozytouch").server == "atlantic_cozytouch"


async def test_a_first_start_records_the_server(tmp_path):
    db = Database(tmp_path / "kelvin.db")
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    rt = await start_runtime(settings, FakeGateway(), start_tasks=False, db=db)
    try:
        assert db.get_setting(SERVER_KEY) == "sauter_cozytouch"
    finally:
        await stop_runtime(rt)


async def test_a_start_on_another_servers_data_is_refused_before_any_call(tmp_path):
    db = Database(tmp_path / "kelvin.db")
    db.set_setting(SERVER_KEY, "atlantic_cozytouch")
    gw = FakeGateway()  # Sauter
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    with pytest.raises(DataServerMismatch) as e:
        await start_runtime(settings, gw, start_tasks=False, db=db)
    assert e.value.server == "atlantic_cozytouch"
    assert gw.logins == 0 and gw.snapshots == 0


async def _boom(*args, **kwargs):
    raise AssertionError("a setup request was sent")


async def test_setup_writes_are_refused_on_an_experimental_server():
    gw = FakeGateway(server="somfy_europe")
    for name in (
        "create_place",
        "update_place",
        "delete_place",
        "relocate_device",
        "rename_device",
        "read_place",
        "read_device",
    ):
        setattr(gw, name, _boom)
    root, devices = sample_house()
    house = build_house(root, devices, wall=ManualClock(10_000.0))
    svc = SetupService(gw, house)
    assert svc.writable is False
    some_room = next(p for p in house.places if p != house.root_oid)
    some_radiator = next(iter(house.radiators))
    attempts = [
        svc.create_room("Bureau"),
        svc.rename_room(some_room, "Bureau"),
        svc.delete_room(some_room),
        svc.move_radiator(some_radiator, some_room),
        svc.rename_radiator(some_radiator, "Radiateur"),
        svc.tidy(f"{some_radiator}#2"),
    ]
    for attempt in attempts:
        with pytest.raises(UserError) as e:
            await attempt
        assert (e.value.code, e.value.status) == ("setup_experimental", 403)


def test_setup_writes_stay_open_on_cozytouch_servers():
    root, devices = sample_house()
    house = build_house(root, devices, wall=ManualClock(10_000.0))
    for sid in ("sauter_cozytouch", "atlantic_cozytouch", "thermor_cozytouch"):
        assert SetupService(FakeGateway(server=sid), house).writable is True
