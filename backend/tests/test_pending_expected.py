from kelvin.commands.service import CommandService
from kelvin.commands.translate import plan_light, plan_mode, plan_setpoint
from kelvin.house.model import build_house
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import ManualClock


def _env():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()))
    return house, CommandService(gw, house, clock=clock)


async def test_pending_view_carries_expected_values():
    house, svc = _env()
    r = house.radiators["9312063"]
    p = await svc.submit("x", (r.id,), plan_mode(r, "manual") + plan_setpoint(r, "manual", 21.5))
    assert p.view()["expected"] == {"9312063": {"mode": "manual", "target": 21.5}}


async def test_expected_covers_comfort_and_eco_and_ignores_other_states():
    house, svc = _env()
    r = house.radiators["9312063"]
    p = await svc.submit(
        "x",
        (r.id,),
        plan_setpoint(r, "comfort", 20.5) + plan_setpoint(r, "eco", 3.5) + plan_light(r, True),
    )
    assert p.view()["expected"] == {"9312063": {"comfort": 20.5, "eco_delta": 3.5}}


async def test_house_radiator_for_url():
    house, _ = _env()
    r = house.radiators["9312063"]
    assert house.radiator_for_url(r.heater_url) == "9312063"
    assert house.radiator_for_url("io://nope/1#1") is None
