from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.alerts.rules import RULES, AlertContext
from kelvin.alerts.service import AlertService
from kelvin.alerts.store import AlertStore
from kelvin.api.sse import Broadcaster
from kelvin.commands.overrides import OverrideManager
from kelvin.commands.service import CommandService, Pending
from kelvin.config import Settings
from kelvin.grid.client import MedPublicClient
from kelvin.grid.fake import FakeGridSource
from kelvin.grid.models import GridSource
from kelvin.grid.service import GridService
from kelvin.grid.store import GridStore
from kelvin.house.model import House, build_house
from kelvin.linky.fake import DEMO_PRM, FakeLinkySource
from kelvin.linky.models import Contract, LinkySource
from kelvin.linky.service import LinkyService
from kelvin.linky.sync import DAILY_BUDGET
from kelvin.overkiz.budget import QuotaReadout, SetupReadGuard
from kelvin.overkiz.errors import SetupBudgetSpent
from kelvin.overkiz.fake import FakeGateway, setup_failures
from kelvin.overkiz.gateway import Gateway
from kelvin.overkiz.models import (
    RawDevice,
    RawPlace,
    device_from_dict,
    device_to_dict,
    place_from_dict,
    place_to_dict,
)
from kelvin.overkiz.poller import EventPump
from kelvin.overkiz.sample import DEMO_OUTAGE_RID
from kelvin.overkiz.servers import DEFAULT_SERVER
from kelvin.overkiz.simhistory import SIM_DB_KEY, seed_history
from kelvin.recorder.db import Database
from kelvin.recorder.energy import local_edges
from kelvin.recorder.recorder import Recorder
from kelvin.scheduler import Scheduler
from kelvin.setup.refresh import SetupRefresher
from kelvin.setup.service import SetupPending, SetupService

log = logging.getLogger(__name__)

# Simulator demo (spec §10.2): « Chambre 2 » unreachable from 45 min before start to 2 h after,
# so the Infos block and the radiator_unreachable alert show in demos and e2e runs.
DEMO_OUTAGE_BEFORE_S = 2700
DEMO_OUTAGE_AFTER_S = 7200

# The structure of the last full setup read (places, devices without their states), so a
# start with the day's full reads spent can still build the house (final review I1).
SETUP_KEY = "overkiz_setup"
SIMULATOR_EXTRA_CALLS = 4
# The Overkiz server whose home this data folder holds (Plan 12). Like the simulator mark
# (SIM_DB_KEY): another server's home never mixes its data into this folder.
SERVER_KEY = "overkiz_server"


class DataServerMismatch(RuntimeError):
    """KELVIN_DATA holds another server's home. Switching server is a fresh install."""

    def __init__(self, server: str) -> None:
        super().__init__("KELVIN_DATA holds another Overkiz server's home; use another folder")
        self.server = server


@dataclass
class Runtime:
    settings: Settings
    gateway: Gateway
    house: House
    db: Database
    broadcaster: Broadcaster
    commands: CommandService
    pump: EventPump
    recorder: Recorder
    overrides: OverrideManager
    tasks: list[asyncio.Task] = field(default_factory=list)
    published_overrides: list[dict[str, Any]] | None = None
    closed: bool = False
    owns_db: bool = True
    linky: LinkyService | None = None
    alerts: AlertService | None = None
    quotas: QuotaReadout | None = None
    setup: SetupService | None = None
    refresher: SetupRefresher | None = None
    grid: GridService | None = None
    scheduler: Scheduler | None = None

    def snapshot(self) -> dict[str, Any]:
        return {
            "house": self.house.view(),
            "pending": [p.view() for p in self.commands.active()]
            + [p.view() for p in (self.setup.active() if self.setup else [])],
            # Settled lately: lets a client that missed the outcome (asleep) use the real status.
            "recent": [p.view() for p in self.commands.recent()]
            + [p.view() for p in (self.setup.recent() if self.setup else [])],
            "overrides": self.overrides.active(),
            "status": self.pump.status(),
            "alerts": (
                self.alerts.store.summary() if self.alerts else {"active": 0, "highest": None}
            ),
            "grid": self.grid.view() if self.grid else None,
        }

    def setup_view(self) -> dict[str, Any]:
        view = self.house.setup_view()
        view["sync"] = self.refresher.view() if self.refresher else None
        return view

    def layout(self) -> dict[str, Any]:
        return {"house": self.house.view(), "setup": self.setup_view()}

    def publish_layout(self) -> None:
        if not self.closed:
            self.broadcaster.publish("layout", self.layout())

    def publish_overrides(self) -> None:
        self.published_overrides = self.overrides.active()
        self.broadcaster.publish("overrides", self.published_overrides)

    def sync_overrides(self) -> None:
        """Publish the overrides when they differ from what clients last received."""
        if self.closed:  # a sync scheduled by a late command update after shutdown
            return
        if self.overrides.active() != self.published_overrides:
            self.publish_overrides()


def alert_context(rt: Runtime, now: float) -> AlertContext:
    """What the alert rules read, at `now` on the runtime's clock (tests pin it)."""
    tz = ZoneInfo(rt.settings.tz)
    today = datetime.fromtimestamp(now, tz).date()
    after = today + timedelta(days=2)
    return AlertContext(
        tz=tz,
        today=today,
        tariff=rt.linky.tariffs.get() if rt.linky else None,
        linky=rt.linky.status() if rt.linky else None,
        house=rt.house,
        db=rt.db,
        tempo=rt.grid.store.tempo_colours(today, after) if rt.grid else {},
        ecowatt=rt.grid.store.ecowatt(today, after) if rt.grid else {},
        contract=rt.linky.tariffs.contract_last() if rt.linky else None,
    )


def make_gateway(
    settings: Settings,
    username: str,
    password: str,
    server: str = DEFAULT_SERVER,
    *,
    wall: Callable[[], float] = time.time,
) -> Gateway:
    if settings.kelvin_fake:
        fixture = settings.kelvin_data / "fake_home.json"
        if fixture.exists():
            data = json.loads(fixture.read_text())
            gw = FakeGateway(
                place_from_dict(data["places"]),
                [device_from_dict(d) for d in data["devices"]],
                username=username,
                password=password,
                server=server,
            )
        else:
            from kelvin.overkiz.houses import HOUSES, house_for_server

            root, devices = HOUSES[settings.kelvin_fake_house or house_for_server(server)]()
            gw = FakeGateway(root, devices, username=username, password=password, server=server)
            if any(u.endswith(f"/{DEMO_OUTAGE_RID}#1") for u in gw.devices):  # the Sauter house
                gw.demo_outage(
                    DEMO_OUTAGE_RID,
                    before_s=DEMO_OUTAGE_BEFORE_S,
                    after_s=DEMO_OUTAGE_AFTER_S,
                    wall=wall,
                )
        gw.fail_setup = setup_failures(settings.kelvin_fake_setup_fail)
        return gw
    from kelvin.overkiz.real import PyOverkizGateway

    return PyOverkizGateway(username, password, server=server)


def make_linky_source(
    settings: Settings,
    *,
    radiators_halfhours: Callable[[date], list[float | None] | None] | None = None,
    wall: Callable[[], float] = time.time,
) -> Callable[[str, str], LinkySource]:
    """`radiators_halfhours` (simulator only): the demo meter includes what the radiators
    drew, half-hour by half-hour (L15)."""
    if settings.kelvin_fake:  # the simulator never calls MyElectricalData
        return lambda prm, token: FakeLinkySource(
            tz=settings.tz, radiators_halfhours=radiators_halfhours, wall=wall
        )
    from kelvin.linky.med import MedSource

    return lambda prm, token: MedSource(prm, token, base_url=settings.med_base_url, tz=settings.tz)


def make_grid_source(
    settings: Settings, simulator: bool, wall: Callable[[], float] = time.time
) -> GridSource:
    """The simulator's grid, or MyElectricalData's public endpoints (no token, dates only)."""
    if settings.kelvin_fake or simulator:
        return FakeGridSource(tz=settings.tz, wall=wall)
    return MedPublicClient(base_url=settings.med_base_url, tz=settings.tz)


def sources(rt: Runtime) -> dict[str, Any] | None:
    """Réglages › Sources: each grid job's state, and the MED ledger."""
    if rt.grid is None or rt.scheduler is None or rt.linky is None:
        return None
    sync = rt.linky.sync
    return {
        "tempo": {**rt.scheduler.status("tempo"), "enabled": rt.grid.tempo_needed()},
        "ecowatt": {**rt.scheduler.status("ecowatt"), "enabled": True},
        "med": {
            "calls_today": sync.calls_today(),
            "grid_calls_today": sync.grid_calls_today(),
            "budget": sync.budget,
        },
    }


def _recorded_halfhours(recorder: Recorder, tz: str) -> Callable[[date], list[float | None] | None]:
    """Radiator Wh per half-hour of a local day, summed over the radiators that know it; None
    for a half-hour none knows, and None for a day none knows at all (simulator only)."""
    zone = ZoneInfo(tz)

    def halves(day: date) -> list[float | None] | None:
        edges = local_edges(day, day + timedelta(days=1), "halfhour", zone)
        rows = list(recorder.energy_buckets(edges).values())
        out: list[float | None] = []
        for i in range(len(edges) - 1):
            known = [wh for row in rows if (wh := row[i].wh) is not None]
            out.append(sum(known) if known else None)
        return out if any(h is not None for h in out) else None

    return halves


def store_setup(db: Database, root: RawPlace, devices: list[RawDevice]) -> None:
    """Keep the structure of a full setup read: places and devices, without their states (no
    stale counter or setpoint can come back from it, and it holds no secret)."""
    db.set_setting(
        SETUP_KEY,
        {
            "places": place_to_dict(root),
            "devices": [device_to_dict(replace(d, states={})) for d in devices],
        },
    )


def stored_setup(db: Database) -> tuple[RawPlace, list[RawDevice]] | None:
    try:
        data = db.get_setting(SETUP_KEY)
        if not data:
            return None
        return place_from_dict(data["places"]), [device_from_dict(d) for d in data["devices"]]
    except Exception as e:  # noqa: BLE001 — an unreadable copy is no copy
        log.warning("stored setup unreadable (%s)", type(e).__name__)
        return None


def start_allowed(guard: SetupReadGuard, db: Database) -> bool:
    """Whether a start may run now (see start_runtime): a stored setup, else one full read
    within the budget plus one startup overdraft per 24 h."""
    return guard.remaining() >= 0 or stored_setup(db) is not None


async def override_step(rt: Runtime) -> list[dict[str, Any]]:
    """One override tick; publishes the list when it changed (restore sent, confirmed, dropped).

    Compared with what was last published, not with the previous tick: an override started and
    cancelled between two ticks would otherwise never be published as gone.
    """
    await rt.overrides.tick()
    rt.sync_overrides()
    return rt.overrides.active()


async def _override_loop(rt: Runtime) -> None:
    while True:
        try:
            await override_step(rt)
        except Exception:
            log.exception("override tick failed")
        await asyncio.sleep(30)


async def start_runtime(
    settings: Settings,
    gateway: Gateway | None = None,
    *,
    start_tasks: bool = True,
    db: Database | None = None,
    linky: tuple[str, str] | None = None,
    guard: SetupReadGuard | None = None,
    wall: Callable[[], float] = time.time,
) -> Runtime:
    """Log in, read the whole setup once and start the runtime. `guard` is the process's
    budget of full setup reads (spec ruling 8).

    A start is never held up for a day by the budget (final review I1). When it is spent, the
    house is built from the stored structure of the last full read and every device's states
    are read one by one (the pump's first poll); with no stored structure (first start, or a
    wiped DB), the setup is read anyway, once per 24 h at most, with a warning: one call over
    a documented daily limit is better than a home without heating control for up to 24 h.
    Beyond that overdraft, SetupBudgetSpent is raised before any Overkiz call."""
    gateway = gateway or make_gateway(
        settings,
        settings.cozy_user,
        settings.cozy_pass.get_secret_value(),
        settings.cozy_server,
        wall=wall,
    )
    owns_db = db is None
    opened: Database | None = None
    linky_service: LinkyService | None = None
    grid: GridService | None = None
    guard = guard or SetupReadGuard()
    try:
        if db is None:
            settings.kelvin_data.mkdir(parents=True, exist_ok=True)
            db = opened = Database(settings.kelvin_data / "kelvin.db")
        stored_server = db.get_setting(SERVER_KEY)
        if stored_server is not None and stored_server != gateway.server:
            raise DataServerMismatch(stored_server)  # before any Overkiz call
        is_sim = isinstance(gateway, FakeGateway)
        if not is_sim and db.get_setting(SIM_DB_KEY) is True:  # before any Overkiz call too
            raise RuntimeError(
                "KELVIN_DATA holds simulator data; use another directory for a real installation."
            )
        stored = None
        if not guard.allowed():
            stored = stored_setup(db)
            if stored is None:
                if guard.remaining() < 0:  # the day's overdraft is spent too
                    raise SetupBudgetSpent("full setup read budget spent")
                log.warning("no stored setup: reading the whole setup over the daily budget")
        await gateway.login()
        if stored is None:
            guard.record()  # the one full setup read of this start
            root, devices = await gateway.snapshot()
            store_setup(db, root, devices)
        else:
            log.info("full setup read budget spent: starting from the stored setup")
            root, devices = stored
        house = build_house(root, devices, wall=wall, server=gateway.server)
        if is_sim:
            house.backdate_status(gateway.sim_status_since)
        if stored_server is None:
            db.set_setting(SERVER_KEY, gateway.server)
        if settings.kelvin_fake and is_sim:  # simulator only, never a real installation
            seeded = seed_history(db, house, wall(), tz=settings.tz)
            if seeded:
                log.info("simulator: seeded %d synthetic history rows", seeded)
        bc = Broadcaster()
        runtime: list[Runtime] = []

        def on_update(p: Pending) -> None:
            bc.publish("pending", p.view())
            if p.status in ("confirmed", "failed", "superseded"):
                # A settled restore ends its override: tell clients now, not at the next tick.
                # Deferred, so the override manager is never re-entered mid-operation.
                if runtime:
                    asyncio.get_running_loop().call_soon(runtime[0].sync_overrides)
                db.log_command(
                    p.view(),
                    [
                        {
                            "device_url": c.device_url,
                            "name": c.name,
                            "parameters": list(c.parameters),
                        }
                        for c in p.planned.commands
                    ],
                )
                if p.status == "failed" and runtime and runtime[0].alerts:
                    runtime[0].alerts.request()  # command_failed shows within seconds

        # The runtime's clock: a pending's time is what the command_failed rule compares with.
        commands = CommandService(gateway, house, wall=wall, on_update=on_update)
        refresher = SetupRefresher(guard, wall=wall, tz=settings.tz)
        if stored is None:
            refresher.full_read_done()  # the startup read above
        else:
            # Started from the stored structure: no read happened, so none is claimed, and
            # what changed in the Cozytouch app meanwhile is unknown until the next read.
            refresher.stale_since = wall()

        def on_setup_update(p: SetupPending) -> None:
            view = p.view()
            bc.publish("pending", view)
            if p.status in ("confirmed", "failed", "unconfirmed"):
                # Labels are logged; place oids and device URLs are not (spec §2.7).
                db.log_command(
                    {**view, "radiator_ids": []}, [{"setup": p.action, "steps": len(p.steps)}]
                )

        setup = SetupService(gateway, house, wall=wall, on_update=on_setup_update)
        setup.on_outside_change = refresher.outside_change
        setup.on_written = refresher.after_write
        refresher.on_withheld = setup.settle_soon
        zone = ZoneInfo(settings.tz)

        def next_sync_when() -> tuple[str | None, str | None]:
            at = refresher.view()["next_possible_at"]
            if at is None:
                return None, None
            when = datetime.fromtimestamp(at, zone)
            today = datetime.fromtimestamp(wall(), zone).date()
            return when.strftime("%H:%M"), None if when.date() == today else when.strftime("%d/%m")

        setup.next_sync_when = next_sync_when

        recorder_ref: list[Recorder] = []

        def on_changed(ids: set[str]) -> None:
            room_ids = {house.radiators[i].room_id for i in ids}
            bc.publish(
                "house",
                {
                    "rooms": [house.room_view(r) for r in house.rooms if r in room_ids],
                    "radiators": [house.radiators[i].view() for i in sorted(ids)],
                },
            )
            if recorder_ref:  # a counter reading's time is when its event arrived
                try:
                    recorder_ref[0].snapshot_energy(ids)
                except Exception:  # the live update went out; the 5-min loop retries
                    log.exception("energy snapshot failed")

        pump = EventPump(
            gateway,
            house,
            commands,
            on_changed=on_changed,
            on_status=lambda s: bc.publish("status", s),
            guard=guard,
            on_setup=lambda r, d: store_setup(db, r, d),
            setup=setup,
            refresher=refresher,
            on_layout=lambda: runtime[0].publish_layout() if runtime else None,
        )
        if stored is None:
            pump.mark_ok()
        else:  # no state known yet: not connected (nothing recorded) until the reads are in
            pump.request_resync()
        commands.on_sent = pump.wake
        recorder = Recorder(db, house, is_fresh=lambda: pump.connected, tz=settings.tz, wall=wall)
        recorder_ref.append(recorder)
        overrides = OverrideManager(
            db, house, commands, wall=wall, is_connected=lambda: pump.connected
        )
        credentials = linky
        if settings.kelvin_fake and is_sim and credentials is None:
            credentials = (DEMO_PRM, "simulator")  # the simulator's Linky is always connected
        linky_service = LinkyService(
            db,
            tz=settings.tz,
            make_source=make_linky_source(
                settings, radiators_halfhours=_recorded_halfhours(recorder, settings.tz), wall=wall
            ),
            credentials=credentials,
            simulator=settings.kelvin_fake,
            wall=wall,
            # The simulator's backfill would spend the whole day's ledger at start and leave a demo
            # that switches to Tempo the same day without colours; real installations keep 10.
            budget=DAILY_BUDGET + SIMULATOR_EXTRA_CALLS if settings.kelvin_fake else DAILY_BUDGET,
        )
        linky_service.tariffs.migrate()  # a v1 tariff becomes v2 once, before any read
        if settings.kelvin_fake and is_sim:
            linky_service.seed_demo_tariff()

        def on_grid() -> None:
            if runtime and runtime[0].grid is not None:
                bc.publish("grid", runtime[0].grid.view())
                if runtime[0].alerts is not None:
                    runtime[0].alerts.request()  # tempo_red_tomorrow, ecowatt

        grid_store = GridStore(db)
        grid = GridService(
            grid_store,
            make_grid_source(settings, is_sim, wall),
            spend=linky_service.spend_grid,
            tariff=linky_service.tariffs.get,
            db=db,
            tz=settings.tz,
            wall=wall,
            on_change=on_grid,
        )
        linky_service.colours = grid_store.tempo_colours
        scheduler = Scheduler(db, grid.jobs(), tz=settings.tz, wall=wall)
        rt = Runtime(
            settings,
            gateway,
            house,
            db,
            bc,
            commands,
            pump,
            recorder,
            overrides,
            owns_db=owns_db,
            linky=linky_service,
            setup=setup,
            refresher=refresher,
            grid=grid,
            scheduler=scheduler,
        )
        rt.quotas = QuotaReadout(lambda: gateway.quotas())  # lazy: stub gateways need no quotas()
        rt.published_overrides = overrides.active()
        rt.alerts = AlertService(
            AlertStore(db, wall=wall),
            dict(RULES),
            lambda: alert_context(rt, wall()),
            publish=lambda s: bc.publish("alerts", s),
            wall=wall,
        )
        on_contract = linky_service.sync.on_contract

        def contract_and_alerts(contract: Contract) -> None:
            if on_contract is not None:
                on_contract(contract)
            if rt.alerts is not None:
                rt.alerts.request()  # hc_changed

        linky_service.sync.on_contract = contract_and_alerts
        runtime.append(rt)
    except BaseException:
        try:
            if linky_service is not None:
                await linky_service.close()
            if grid is not None:
                await grid.aclose()
        finally:
            if opened is not None:
                opened.close()
            await gateway.close()
        raise
    if start_tasks:
        # Linky's backfill leaves room for the grid calls still planned today and for the
        # afternoon run's retry of the newest days (only when the scheduler runs).
        sync = linky_service.sync
        sync.reserve = lambda: grid.planned_today() + sync.essential_ahead()
        rt.tasks = [
            asyncio.create_task(pump.run()),
            asyncio.create_task(recorder.run()),
            asyncio.create_task(_override_loop(rt)),
            asyncio.create_task(linky_service.run()),
            asyncio.create_task(rt.alerts.run()),
            asyncio.create_task(scheduler.run()),
        ]
    return rt


async def stop_runtime(rt: Runtime) -> None:
    rt.closed = True
    for t in rt.tasks:
        t.cancel()
    for t in rt.tasks:
        with contextlib.suppress(asyncio.CancelledError):
            await t
    try:
        try:
            if rt.linky is not None:
                await rt.linky.close()
            if rt.grid is not None:
                await rt.grid.aclose()
        finally:
            await rt.gateway.close()
    finally:
        if rt.owns_db:
            rt.db.close()
