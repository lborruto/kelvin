import pytest
from pyoverkiz import exceptions as ox

from kelvin.commands.service import CommandService
from kelvin.house.model import build_house
from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError
from kelvin.overkiz.fake import DEMO_EMAIL, DEMO_PASSWORD, FakeGateway
from kelvin.overkiz.poller import EventPump
from kelvin.overkiz.real import _map_error
from tests.conftest import ManualClock


def test_pyoverkiz_bad_credentials_map_to_bad_credentials():
    err = _map_error(ox.BadCredentialsError("Bad credentials"))
    assert isinstance(err, BadCredentialsError) and isinstance(err, AuthError)
    assert not isinstance(_map_error(ox.NotAuthenticatedError("x")), BadCredentialsError)


async def test_fake_accepts_only_the_cloud_credentials():
    gw = FakeGateway(clock=ManualClock())
    await gw.login()  # demo by default
    assert (DEMO_EMAIL, DEMO_PASSWORD) == ("demo@kelvin.local", "kelvin")
    await gw.check_credentials("DEMO@kelvin.local ", "kelvin")
    with pytest.raises(BadCredentialsError):
        await gw.check_credentials(DEMO_EMAIL, "wrong")
    await gw.set_credentials(DEMO_EMAIL, "wrong")
    with pytest.raises(BadCredentialsError):
        await gw.login()
    gw.cloud_password = "wrong"  # the password changed on Cozytouch
    await gw.login()
    gw.fail_login = GatewayError("down")
    with pytest.raises(GatewayError):
        await gw.check_credentials(DEMO_EMAIL, "wrong")
    assert gw.checks == 3


def _pump():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()))
    statuses: list[dict] = []
    pump = EventPump(
        gw,
        house,
        CommandService(gw, house, clock=clock),
        clock=clock,
        wall=clock,
        on_status=statuses.append,
    )
    pump.mark_ok()
    return gw, pump, statuses


async def test_rejected_password_stops_overkiz_calls_and_is_published():
    gw, pump, statuses = _pump()
    gw.cloud_password = "changed-on-cozytouch"
    gw.fail_fetch = AuthError("session expired")
    await pump.run_once()  # fetch fails, re-login is refused
    assert pump.auth_rejected is True
    assert pump.status()["auth_rejected"] is True
    assert statuses[-1]["auth_rejected"] is True
    logins = gw.logins
    gw.fail_fetch = None
    assert await pump.run_once() == pump.max_backoff
    assert gw.logins == logins  # no new attempt with a known-bad password


async def test_credentials_changed_resumes_the_pump():
    gw, pump, statuses = _pump()
    gw.cloud_password = "new"
    gw.fail_fetch = AuthError("expired")
    await pump.run_once()
    gw.fail_fetch = None
    await gw.set_credentials(DEMO_EMAIL, "new")
    pump.credentials_changed()
    assert pump.auth_rejected is False
    assert statuses[-1]["auth_rejected"] is False
    assert await pump.run_once() == pump.idle_interval
    assert pump.connected is True
