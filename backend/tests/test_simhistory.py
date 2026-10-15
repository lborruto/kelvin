from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from kelvin.api.runtime import start_runtime, stop_runtime
from kelvin.config import Settings
from kelvin.house.model import build_house
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.sample import sample_house
from kelvin.overkiz.simhistory import seed_history
from kelvin.recorder.db import Database

PARIS = ZoneInfo("Europe/Paris")
NOW = datetime(2026, 10, 13, 12, 3, tzinfo=PARIS).timestamp()


@pytest.fixture
def env():
    return Database(":memory:"), build_house(*sample_house())


def test_seeds_samples_per_radiator(env):
    db, house = env
    assert seed_history(db, house, NOW, days=7) > 0
    for rid in house.radiators:
        n = db.query("SELECT COUNT(*) AS n FROM samples WHERE radiator_id = ?", (rid,))[0]["n"]
        assert abs(n - 7 * 288) <= 2


def test_idempotent(env):
    db, house = env
    seed_history(db, house, NOW)
    assert seed_history(db, house, NOW) == 0


def test_comfort_warmer_than_eco(env):
    db, house = env
    seed_history(db, house, NOW)
    checked = 0
    for r in house.radiators.values():
        if r.mode != "program":
            continue

        def avg(level, r=r):
            rows = db.query(
                "SELECT AVG(temperature) AS a FROM samples"
                " WHERE radiator_id = ? AND heating_level = ?",
                (r.id, level),
            )
            return rows[0]["a"]

        assert avg("comfort") > avg("eco")
        checked += 1
    assert checked


def test_last_sample_joins_live_value(env):
    db, house = env
    seed_history(db, house, NOW)
    for r in house.radiators.values():
        last = db.query(
            "SELECT temperature FROM samples WHERE radiator_id = ? ORDER BY ts DESC LIMIT 1",
            (r.id,),
        )[0]
        assert abs(last["temperature"] - r.temperature) <= 0.5


def test_energy_ends_at_current_totals(env):
    db, house = env
    seed_history(db, house, NOW)
    grew = []
    for r in house.radiators.values():
        if r.power_w is None or r.energy_wh is None:
            continue
        rows = db.query("SELECT * FROM energy WHERE radiator_id = ? ORDER BY ts", (r.id,))
        assert len(rows) == 7 * 24 + 1
        assert rows[-1]["total_wh"] == pytest.approx(r.energy_wh["total"])
        assert rows[-1]["t1_wh"] == pytest.approx(r.energy_wh["t1"])
        assert rows[-1]["t2_wh"] == pytest.approx(r.energy_wh["t2"])
        totals = [x["total_wh"] for x in rows]
        assert totals == sorted(totals) and totals[0] >= 0
        grew.append(totals[-1] > totals[0])

    assert any(grew)


async def test_runtime_seeds_only_in_fake_mode(tmp_path):
    fake = await start_runtime(
        Settings(_env_file=None, kelvin_data=tmp_path / "a", kelvin_fake=True),
        FakeGateway(),
        start_tasks=False,
    )
    real = await start_runtime(
        Settings(_env_file=None, kelvin_data=tmp_path / "b", kelvin_fake=False),
        FakeGateway(),
        start_tasks=False,
    )
    try:
        assert fake.db.query("SELECT COUNT(*) AS n FROM samples")[0]["n"] > 0
        assert real.db.query("SELECT COUNT(*) AS n FROM samples") == [{"n": 0}]
        assert real.db.query("SELECT COUNT(*) AS n FROM energy") == [{"n": 0}]
    finally:
        await stop_runtime(fake)
        await stop_runtime(real)


class StubGateway:
    """Minimal non-Fake gateway, standing in for the real one."""

    def __init__(self):
        self.closed = False

    async def login(self):
        pass

    async def snapshot(self):
        return sample_house()

    async def close(self):
        self.closed = True


async def test_fake_runtime_on_non_empty_db_seeds_nothing(tmp_path):
    db = Database(tmp_path / "kelvin.db")
    db.execute("INSERT INTO samples (ts, radiator_id, temperature) VALUES (1, 'x', 20)")
    db.close()
    rt = await start_runtime(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(),
        start_tasks=False,
    )
    try:
        assert rt.db.query("SELECT COUNT(*) AS n FROM samples")[0]["n"] == 1
        assert rt.db.get_setting("sim_db") is None
    finally:
        await stop_runtime(rt)


async def test_real_gateway_refuses_sim_db(tmp_path):
    sim = await start_runtime(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(),
        start_tasks=False,
    )
    assert sim.db.get_setting("sim_db") is True
    await stop_runtime(sim)
    gw = StubGateway()
    with pytest.raises(RuntimeError, match="simulator data"):
        await start_runtime(
            Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=False), gw, start_tasks=False
        )
    assert gw.closed


async def test_fake_flag_with_non_fake_gateway_seeds_nothing(tmp_path):
    rt = await start_runtime(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        StubGateway(),
        start_tasks=False,
    )
    try:
        assert rt.db.query("SELECT COUNT(*) AS n FROM samples") == [{"n": 0}]
    finally:
        await stop_runtime(rt)


def test_dst_day_keeps_paris_wall_time(env):
    db, house = env
    now = datetime(2026, 10, 26, 12, 0, tzinfo=PARIS).timestamp()
    seed_history(db, house, now, days=3)
    checked = 0
    for r in house.radiators.values():
        if r.mode != "program":
            continue
        slots = r.program["sunday"]  # 2026-10-25, the 25 h day
        for row in db.query("SELECT ts, heating_level FROM samples WHERE radiator_id = ?", (r.id,)):
            local = datetime.fromtimestamp(row["ts"], PARIS)
            if local.date().isoformat() != "2026-10-25":
                continue
            minute = local.hour * 60 + local.minute
            inside = any(
                int(sl["start"][:2]) * 60 + int(sl["start"][3:])
                <= minute
                < int(sl["end"][:2]) * 60 + int(sl["end"][3:])
                for sl in slots
            )
            assert (row["heating_level"] == "comfort") == inside
            checked += 1
    assert checked >= 25 * 12


def test_energy_split_follows_offpeak_hours(env):
    db, house = env
    seed_history(db, house, NOW)
    t1_seen = t2_seen = 0
    for r in house.radiators.values():
        rows = db.query("SELECT * FROM energy WHERE radiator_id = ? ORDER BY ts", (r.id,))
        for a, b in zip(rows, rows[1:], strict=False):
            hour = datetime.fromtimestamp(a["ts"], PARIS).hour  # hour being consumed
            d1, d2 = b["t1_wh"] - a["t1_wh"], b["t2_wh"] - a["t2_wh"]
            offpeak = hour >= 22 or hour < 6
            if offpeak:
                assert d2 == pytest.approx(0)
                t1_seen += d1 > 0
            else:
                assert d1 == pytest.approx(0)
                t2_seen += d2 > 0
    assert t1_seen and t2_seen


def test_heating_duty_is_proportional_and_every_radiator_draws(env):
    """Near the setpoint a radiator runs part-time, not at full power; every room heats."""
    db, house = env
    seed_history(db, house, NOW)
    rates = [r["working_rate"] for r in db.query("SELECT working_rate FROM samples")]
    assert any(0 < x < 100 for x in rates)
    for rid in house.radiators:
        rows = db.query(
            "SELECT MIN(total_wh) AS a, MAX(total_wh) AS b FROM energy WHERE radiator_id = ?",
            (rid,),
        )
        assert rows[0]["b"] > rows[0]["a"], rid
