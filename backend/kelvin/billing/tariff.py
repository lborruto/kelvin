"""Tariff model v2 (spec §2.2): options base, HC/HP and Tempo; dated, seasonal off-peak
schedules; Tempo hours; dated price rows, each with its own option, so a change of option keeps
the days before it priced exactly as they were billed.

Stored as the `tariff` setting. A v1 setting (`hc_slots` + `hc_eur_kwh`/`hp_eur_kwh` rows) is
migrated the first time it is read, with no user action: one schedule for all 12 months from
the earliest price, `rates = {hc, hp}`. The original is kept once as `tariff_v1`.
"""

from __future__ import annotations

import logging
import math
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from functools import cache
from typing import Any

from kelvin.billing.slots import Ranges, Slot, SlotError, slot_ranges, to_minutes
from kelvin.errors import UserError
from kelvin.linky.models import Contract
from kelvin.recorder.db import Database

log = logging.getLogger(__name__)

KVA_CHOICES = (3, 6, 9, 12, 15, 18, 24, 30, 36)
TARIFF_KEY = "tariff"
TARIFF_V1_KEY = "tariff_v1"
TARIFF_INVALID_KEY = "tariff_invalid"  # an invalid document a save replaced, kept for recovery
PREFILL_KEY = "tariff_prefill"
CONTRACT_KEY = "contract_last"
OPTIONS = ("base", "hchp", "tempo")
RATE_KEYS: dict[str, tuple[str, ...]] = {
    "base": ("base",),
    "hchp": ("hc", "hp"),
    "tempo": ("blue_hc", "blue_hp", "white_hc", "white_hp", "red_hc", "red_hp"),
}
ALL_MONTHS = tuple(range(1, 13))
TEMPO_DAY_START = "06:00"  # a Tempo day runs 06:00 → 06:00 the next day (contract; not editable)
MAX_ROWS = 100
MAX_SCHEDULES = 24
MAX_VARIANTS = 4
RATE_MAX = 10.0
SUBSCRIPTION_MAX = 1000.0


def _rank(option: str, key: str) -> tuple[int, str]:
    order = RATE_KEYS.get(option, ())
    return (order.index(key) if key in order else len(order), key)


@dataclass(frozen=True)
class PriceRow:
    valid_from: date
    option: str  # base | hchp | tempo
    subscription_eur_month: float
    rates: tuple[tuple[str, float], ...]  # RATE_KEYS order; a tuple keeps rows hashable

    def rate(self, key: str) -> float | None:
        for k, v in self.rates:
            if k == key:
                return v
        return None

    @property
    def hc_eur_kwh(self) -> float | None:  # v1 name
        return self.rate("hc")

    @property
    def hp_eur_kwh(self) -> float | None:  # v1 name
        return self.rate("hp")

    def view(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "valid_from": self.valid_from.isoformat(),
            "option": self.option,
            "subscription_eur_month": self.subscription_eur_month,
            "rates": dict(self.rates),
        }
        if self.option == "hchp":  # v1 fields, additive
            out["hc_eur_kwh"] = self.hc_eur_kwh
            out["hp_eur_kwh"] = self.hp_eur_kwh
        return out

    @classmethod
    def make(
        cls, valid_from: date, option: str, subscription: float, rates: dict[str, float]
    ) -> PriceRow:
        keys = sorted(rates, key=lambda k: _rank(option, k))
        return cls(
            valid_from, option, float(subscription), tuple((k, float(rates[k])) for k in keys)
        )

    @classmethod
    def from_view(cls, d: dict[str, Any]) -> PriceRow:
        valid_from = date.fromisoformat(d["valid_from"])
        if "rates" in d:
            return cls.make(
                valid_from, d.get("option", "hchp"), d["subscription_eur_month"], d["rates"]
            )
        return cls.make(  # a v1 row
            valid_from,
            "hchp",
            d["subscription_eur_month"],
            {"hc": d["hc_eur_kwh"], "hp": d["hp_eur_kwh"]},
        )


def Prices(  # noqa: N802 — the v1 class's constructor, kept for callers and tests
    valid_from: date, subscription_eur_month: float, hc_eur_kwh: float, hp_eur_kwh: float
) -> PriceRow:
    return PriceRow.make(
        valid_from, "hchp", subscription_eur_month, {"hc": hc_eur_kwh, "hp": hp_eur_kwh}
    )


def _slots_view(slots: Iterable[Slot]) -> list[dict[str, str]]:
    return [{"start": s.start, "end": s.end} for s in slots]


def _slots_of(raw: Iterable[dict[str, str]]) -> tuple[Slot, ...]:
    return tuple(Slot(s["start"], s["end"]) for s in raw)


@dataclass(frozen=True)
class HcVariant:
    months: tuple[int, ...]
    slots: tuple[Slot, ...]


@dataclass(frozen=True)
class HcSchedule:
    valid_from: date
    variants: tuple[HcVariant, ...]

    def slots_for_month(self, month: int) -> tuple[Slot, ...] | None:
        for v in self.variants:
            if month in v.months:
                return v.slots
        return None

    def view(self) -> dict[str, Any]:
        return {
            "valid_from": self.valid_from.isoformat(),
            "variants": [
                {"months": list(v.months), "slots": _slots_view(v.slots)} for v in self.variants
            ],
        }

    @classmethod
    def from_view(cls, d: dict[str, Any]) -> HcSchedule:
        return cls(
            date.fromisoformat(d["valid_from"]),
            tuple(
                HcVariant(tuple(int(m) for m in v["months"]), _slots_of(v["slots"]))
                for v in d["variants"]
            ),
        )


@dataclass(frozen=True)
class TempoHours:
    hc_start: str = "22:00"
    hc_end: str = "06:00"

    def view(self) -> dict[str, str]:
        return {"hc_start": self.hc_start, "hc_end": self.hc_end, "day_start": TEMPO_DAY_START}

    @classmethod
    def from_view(cls, d: dict[str, Any] | None) -> TempoHours:
        d = d or {}
        return cls(d.get("hc_start", "22:00"), d.get("hc_end", "06:00"))


@cache
def ranges_of(slots: tuple[Slot, ...]) -> Ranges:
    """Validated minute ranges of a slot set (cached: pricing asks for them per half-hour)."""
    return slot_ranges(slots)


def _check_months(s: HcSchedule) -> None:
    if not 1 <= len(s.variants) <= MAX_VARIANTS:
        raise UserError("invalid_request")
    counts = Counter(m for v in s.variants for m in v.months)
    if any(not 1 <= m <= 12 for m in counts):
        raise UserError("invalid_request")
    over = sorted(m for m, n in counts.items() if n > 1)
    if over:
        raise UserError("hc_months_overlap", months=over)
    missing = sorted(set(ALL_MONTHS) - set(counts))
    if missing:
        raise UserError("hc_months_missing", months=missing)


@dataclass(frozen=True)
class Tariff:
    option: str  # the latest price row's option (the v1 field)
    kva: int
    hc_slots: tuple[Slot, ...]  # v1 field: with no hc_schedules, one all-year schedule
    prices: tuple[PriceRow, ...]  # sorted by valid_from
    hc_schedules: tuple[HcSchedule, ...] = ()
    tempo_hours: TempoHours = field(default_factory=TempoHours)

    def __post_init__(self) -> None:
        if not self.hc_schedules and self.hc_slots and self.prices:
            # The v1 shape, and the migration rule (spec §2.2): one schedule for the 12 months
            # from the earliest price.
            only = HcSchedule(
                self.prices[0].valid_from, (HcVariant(ALL_MONTHS, tuple(self.hc_slots)),)
            )
            object.__setattr__(self, "hc_schedules", (only,))

    @classmethod
    def build(
        cls,
        kva: int,
        prices: Iterable[PriceRow],
        hc_schedules: Iterable[HcSchedule] = (),
        tempo_hours: TempoHours | None = None,
    ) -> Tariff:
        rows = tuple(sorted(prices, key=lambda p: p.valid_from))
        scheds = tuple(sorted(hc_schedules, key=lambda s: s.valid_from))
        latest = scheds[-1].variants[0].slots if scheds and scheds[-1].variants else ()
        return cls(
            rows[-1].option if rows else "hchp",
            kva,
            latest,
            rows,
            scheds,
            tempo_hours or TempoHours(),
        )

    def prices_on(self, day: date) -> PriceRow:
        """The row in force that day; days before the first row use it (`retro_priced`)."""
        chosen = self.prices[0]
        for p in self.prices:
            if p.valid_from > day:
                break
            chosen = p
        return chosen

    def option_on(self, day: date) -> str:
        return self.prices_on(day).option

    def options(self) -> set[str]:
        return {p.option for p in self.prices}

    def schedule_on(self, day: date) -> HcSchedule | None:
        if not self.hc_schedules:
            return None
        chosen = self.hc_schedules[0]
        for s in self.hc_schedules:
            if s.valid_from > day:
                break
            chosen = s
        return chosen

    def slots_on(self, day: date) -> tuple[Slot, ...] | None:
        """The off-peak slots of a day: the variant holding its month, in the schedule with the
        last valid_from ≤ day (days before the first schedule use the first)."""
        s = self.schedule_on(day)
        return s.slots_for_month(day.month) if s else None

    def ranges_on(self, day: date) -> Ranges | None:
        slots = self.slots_on(day)
        return ranges_of(slots) if slots else None

    def tempo_ranges(self) -> Ranges:
        return ranges_of((Slot(self.tempo_hours.hc_start, self.tempo_hours.hc_end),))

    def retro_priced(self, day: date) -> bool:
        return day < self.prices[0].valid_from

    def retro_scheduled(self, day: date) -> bool:
        return (
            self.option_on(day) == "hchp"
            and bool(self.hc_schedules)
            and day < self.hc_schedules[0].valid_from
        )

    def edges(self) -> set[int]:
        """Minute-of-day edges where an off-peak period starts or ends (L11 « ≈ »)."""
        out: set[int] = set()
        if "hchp" in self.options():
            for s in self.hc_schedules:
                for v in s.variants:
                    for slot in v.slots:
                        out |= {to_minutes(slot.start), to_minutes(slot.end)}
        if "tempo" in self.options():
            out |= {to_minutes(self.tempo_hours.hc_start), to_minutes(self.tempo_hours.hc_end)}
        return {m % 1440 for m in out}

    def validate(self) -> Tariff:
        if self.kva not in KVA_CHOICES:
            raise UserError("kva_unknown")
        if not self.prices:
            raise UserError("tariff_prices_missing")
        if len(self.prices) > MAX_ROWS or len(self.hc_schedules) > MAX_SCHEDULES:
            raise UserError("invalid_request")
        seen: set[date] = set()
        for p in self.prices:
            if p.valid_from in seen:
                raise UserError("tariff_dates_duplicate", date=p.valid_from.isoformat())
            seen.add(p.valid_from)
            if p.option not in OPTIONS:
                raise UserError("tariff_option_unsupported")
            sub = p.subscription_eur_month
            if not math.isfinite(sub) or not 0 < sub < SUBSCRIPTION_MAX:
                raise UserError("price_subscription_invalid")
            got = dict(p.rates)
            # The param is `rate` and the variable `rate_key`: tests/test_error_codes.py refuses a
            # param named `key` and a value read from a variable named like an id or a secret.
            for rate_key in RATE_KEYS[p.option]:
                v = got.get(rate_key)
                if v is None or not math.isfinite(v) or not 0 < v < RATE_MAX:
                    raise UserError("tariff_rates_invalid", rate=rate_key)
            extra = sorted(set(got) - set(RATE_KEYS[p.option]))
            if extra:
                raise UserError("tariff_rates_invalid", rate=extra[0])
        if "hchp" in self.options() and not self.hc_schedules:
            raise UserError("hc_schedules_missing")
        dates: set[date] = set()
        for s in self.hc_schedules:
            if s.valid_from in dates:
                raise UserError("tariff_dates_duplicate", date=s.valid_from.isoformat())
            dates.add(s.valid_from)
            _check_months(s)
            for v in s.variants:
                slot_ranges(v.slots)  # SlotError codes (Plan 7)
        if "tempo" in self.options():
            try:
                a, b = to_minutes(self.tempo_hours.hc_start), to_minutes(self.tempo_hours.hc_end)
            except SlotError:
                raise UserError("tempo_hours_invalid") from None
            if a == b:
                raise UserError("tempo_hours_invalid")
        return self

    def view(self) -> dict[str, Any]:
        return {
            "option": self.option,
            "kva": self.kva,
            "hc_slots": _slots_view(self.hc_slots),  # v1 field: the latest schedule's first variant
            "hc_schedules": [s.view() for s in self.hc_schedules],
            "tempo_hours": self.tempo_hours.view(),
            "prices": [p.view() for p in self.prices],
        }

    @classmethod
    def from_view(cls, d: dict[str, Any]) -> Tariff:
        rows = [PriceRow.from_view(p) for p in d["prices"]]
        if "hc_schedules" in d:
            return cls.build(
                int(d["kva"]),
                rows,
                [HcSchedule.from_view(s) for s in d["hc_schedules"]],
                TempoHours.from_view(d.get("tempo_hours")),
            )
        rows.sort(key=lambda p: p.valid_from)  # v1
        return cls(d.get("option", "hchp"), int(d["kva"]), _slots_of(d["hc_slots"]), tuple(rows))


@dataclass(frozen=True)
class TariffUpdate:
    """The v1 body: power, one slot set and one HC/HP price row."""

    kva: int
    hc_slots: tuple[Slot, ...]
    prices: PriceRow
    option: str = "hchp"


class TariffStore:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._logged: Any = None  # the last invalid document logged: one warning per document

    def _warn(self, raw: Any, msg: str, what: str) -> None:
        if raw != self._logged:
            self._logged = raw
            log.warning(msg, what)

    def _load(self) -> tuple[dict[str, Any] | None, Tariff | None]:
        """The stored document and its tariff; an invalid one gives no tariff (logged by code):
        figures then read « — », never priced by a tariff the form could not have saved."""
        raw = self.db.get_setting(TARIFF_KEY)
        if not raw:
            return None, None
        try:
            return raw, Tariff.from_view(raw).validate()
        except UserError as e:
            self._warn(raw, "tariff setting invalid: %s", e.code)
            return raw, None
        except (KeyError, TypeError, ValueError, AttributeError) as e:  # a malformed document
            self._warn(raw, "tariff setting unreadable: %s", type(e).__name__)
            return raw, None

    def stored(self) -> bool:
        """A document is stored, valid or not."""
        return bool(self.db.get_setting(TARIFF_KEY))

    def get(self) -> Tariff | None:
        """The tariff (a v1 document not migrated yet reads the same, in memory). Never writes."""
        return self._load()[1]

    def migrate(self) -> bool:
        """Once, at startup: a valid v1 document becomes v2 (spec §2.2, no user action); the
        original is kept once as `tariff_v1`. True when it migrated."""
        raw, tariff = self._load()
        if raw is None or tariff is None or "hc_schedules" in raw:
            return False
        if self.db.get_setting(TARIFF_V1_KEY) is None:
            self.db.set_setting(TARIFF_V1_KEY, raw)  # the backup first, then the overwrite
        self.save(tariff)
        log.info("tariff setting migrated to v2")
        return True

    def save(self, tariff: Tariff) -> None:
        self.db.set_setting(TARIFF_KEY, tariff.view())

    def replace(self, tariff: Tariff) -> Tariff:
        """The v2 document: validated as a whole, then stored as given. An invalid stored
        document it replaces is kept first as `tariff_invalid` (saving is the user's way out of
        it; a later, stricter validation must never erase their rows unseen)."""
        tariff.validate()
        raw, current = self._load()
        if raw is not None and current is None:
            self.db.set_setting(TARIFF_INVALID_KEY, raw)
        self.save(tariff)
        return tariff

    def update(self, u: TariffUpdate) -> Tariff:
        """The v1 body: set the power, upsert the HC/HP row at its valid_from (same date:
        replaced) and, when the slots differ from that day's, add a schedule from that day."""
        if u.option != "hchp" or u.prices.option != "hchp":
            raise UserError("tariff_option_unsupported")
        if u.kva not in KVA_CHOICES:
            raise UserError("kva_unknown")
        slot_ranges(u.hc_slots)
        current = self.get()
        if current is not None and current.options() != {"hchp"}:
            # A form from before the option changed (a stale tab) would overwrite Tempo or Base
            # rows with HC/HP ones: refused, the page must be reloaded.
            raise UserError("tariff_form_outdated")
        day = u.prices.valid_from
        rows = [p for p in (current.prices if current else ()) if p.valid_from != day]
        scheds = list(current.hc_schedules) if current else []
        if current is None or current.slots_on(day) != tuple(u.hc_slots):
            scheds = [s for s in scheds if s.valid_from != day]
            scheds.append(HcSchedule(day, (HcVariant(ALL_MONTHS, tuple(u.hc_slots)),)))
        tariff = Tariff.build(
            u.kva, [*rows, u.prices], scheds, current.tempo_hours if current else None
        )
        return self.replace(tariff)

    def prefill(self) -> dict[str, Any] | None:
        return self.db.get_setting(PREFILL_KEY)

    def clear_prefill(self) -> None:
        self.db.execute("DELETE FROM settings WHERE key = ?", (PREFILL_KEY,))

    def set_prefill(self, contract: Contract) -> None:
        self.db.set_setting(
            PREFILL_KEY,
            {
                "kva": contract.kva,
                "hc_slots": [{"start": a, "end": b} for a, b in contract.offpeak],
            },
        )

    def contract_last(self) -> dict[str, Any] | None:
        """The last contract read (Enedis via MED): subscribed power and off-peak hours."""
        return self.db.get_setting(CONTRACT_KEY)

    def set_contract_last(self, contract: Contract, fetched_at: float) -> None:
        self.db.set_setting(
            CONTRACT_KEY,
            {
                "kva": contract.kva,
                "offpeak": [{"start": a, "end": b} for a, b in contract.offpeak],
                "fetched_at": fetched_at,
            },
        )
