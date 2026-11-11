import pytest
from pyoverkiz import exceptions as ox

from kelvin.commands.service import CommandService
from kelvin.house.model import build_house
from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError
from kelvin.overkiz.fake import DEMO_EMAIL, DEMO_PASSWORD, FakeGateway
from kelvin.overkiz.models import DeviceCommand
from kelvin.overkiz.poller import EventPump
from kelvin.overkiz.real import PyOverkizGateway, _map_error
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


async def test_credentials_changed_resyncs_once_within_the_budget():
    gw, pump, _ = _pump()
    pump.credentials_changed()
    await pump.run_once()
    assert gw.snapshots == 1
    await pump.run_once()
    assert gw.snapshots == 1


async def test_bad_credentials_from_a_poll_are_not_tried_again():
    """pyoverkiz re-logs in by itself on an expired session; a refusal comes back as bad
    credentials. The pump's own login would be a second bad attempt on the account."""
    gw, pump, statuses = _pump()
    gw.fail_fetch = BadCredentialsError("Bad credentials")
    await pump.run_once()
    assert gw.logins == 0
    assert pump.auth_rejected is True and statuses[-1]["auth_rejected"] is True


class _RefusingClient:
    """Stands in for pyoverkiz's client: its re-login is refused (no network is touched)."""

    def __init__(self, refuse: bool = True) -> None:
        self.refuse = refuse
        self.logins = 0
        self.calls = 0
        self.event_listener_id = None

    async def _any(self, *_a, **_kw):
        self.calls += 1
        if self.refuse:
            self.logins += 1  # pyoverkiz's retry_on_auth_error: one login per call
            raise ox.BadCredentialsError("Bad credentials")
        return []

    login = fetch_events = get_state = execute_action_group = get_places = get_devices = _any
    _get = _refresh_token_if_expired = _any

    async def close(self):
        return None


async def test_the_real_gateway_makes_no_call_once_its_credentials_were_refused(monkeypatch):
    gw = PyOverkizGateway("me@example.fr", "old")
    client = gw._client = _RefusingClient()
    with pytest.raises(BadCredentialsError):
        await gw.fetch_events()
    assert client.logins == 1
    for call in (
        gw.fetch_events,
        gw.login,
        gw.snapshot,
        gw.quotas,
        lambda: gw.device_states("io://g/1#1"),
        lambda: gw.execute([DeviceCommand("io://g/1#1", "identify")], "test"),
        lambda: gw.read_place("p"),
        lambda: gw.rename_device("io://g/1#1", "Salon"),
    ):
        with pytest.raises(BadCredentialsError):
            await call()
    assert (client.logins, client.calls) == (1, 1)  # nothing reached pyoverkiz again
    # Another password is still checked (its own client), and new credentials resume the calls.
    fresh = _RefusingClient(refuse=False)
    monkeypatch.setattr(gw, "_client_for", lambda creds: fresh)
    await gw.check_credentials("me@example.fr", "new")
    await gw.set_credentials("me@example.fr", "new")
    await gw.login()
    assert await gw.fetch_events() == []
    assert fresh.calls == 3


async def test_a_refused_check_of_other_credentials_does_not_stop_the_gateway(monkeypatch):
    gw = PyOverkizGateway("me@example.fr", "good")
    gw._client = _RefusingClient(refuse=False)
    monkeypatch.setattr(gw, "_client_for", lambda creds: _RefusingClient())
    with pytest.raises(BadCredentialsError):
        await gw.check_credentials("me@example.fr", "typo")
    assert await gw.fetch_events() == []
