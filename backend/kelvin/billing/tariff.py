"""Tariff config (spec §3.6): option, subscribed power, HC slots, and prices with history."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from kelvin.billing.slots import Ranges, Slot, slot_ranges
from kelvin.errors import UserError
from kelvin.linky.models import Contract
from kelvin.recorder.db import Database

KVA_CHOICES = (3, 6, 9, 12, 15, 18, 24, 30, 36)
TARIFF_KEY = "tariff"
PREFILL_KEY = "tariff_prefill"


@dataclass(frozen=True)
class Prices:
    valid_from: date
    subscription_eur_month: float
    hc_eur_kwh: float
    hp_eur_kwh: float

    def view(self) -> dict[str, Any]:
        return {
            "valid_from": self.valid_from.isoformat(),
            "subscription_eur_month": self.subscription_eur_month,
            "hc_eur_kwh": self.hc_eur_kwh,
            "hp_eur_kwh": self.hp_eur_kwh,
        }

    @classmethod
    def from_view(cls, d: dict[str, Any]) -> Prices:
        return cls(
            date.fromisoformat(d["valid_from"]),
            float(d["subscription_eur_month"]),
            float(d["hc_eur_kwh"]),
            float(d["hp_eur_kwh"]),
        )


@dataclass(frozen=True)
class Tariff:
    option: str  # "hchp" (base and tempo are modelled later, hidden in v1)
    kva: int
    hc_slots: tuple[Slot, ...]
    prices: tuple[Prices, ...]  # sorted by valid_from, never empty

    def prices_on(self, day: date) -> Prices:
        chosen = self.prices[0]
        for p in self.prices:
            if p.valid_from > day:
                break
            chosen = p
        return chosen

    def ranges(self) -> Ranges:
        return slot_ranges(self.hc_slots)

    def view(self) -> dict[str, Any]:
        return {
            "option": self.option,
            "kva": self.kva,
            "hc_slots": [{"start": s.start, "end": s.end} for s in self.hc_slots],
            "prices": [p.view() for p in self.prices],
        }

    @classmethod
    def from_view(cls, d: dict[str, Any]) -> Tariff:
        return cls(
            d["option"],
            int(d["kva"]),
            tuple(Slot(s["start"], s["end"]) for s in d["hc_slots"]),
            tuple(Prices.from_view(p) for p in d["prices"]),
        )


@dataclass(frozen=True)
class TariffUpdate:
    kva: int
    hc_slots: tuple[Slot, ...]
    prices: Prices
    option: str = "hchp"


class TariffStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def get(self) -> Tariff | None:
        raw = self.db.get_setting(TARIFF_KEY)
        return Tariff.from_view(raw) if raw else None

    def save(self, tariff: Tariff) -> None:
        self.db.set_setting(TARIFF_KEY, tariff.view())

    def update(self, u: TariffUpdate) -> Tariff:
        """Set power and slots; add the prices at their valid_from (same date: replaced)."""
        if u.option != "hchp":
            raise UserError("tariff_option_unsupported")
        if u.kva not in KVA_CHOICES:
            raise UserError("kva_unknown")
        slot_ranges(u.hc_slots)
        current = self.get()
        kept = [
            p for p in (current.prices if current else ()) if p.valid_from != u.prices.valid_from
        ]
        prices = tuple(sorted([*kept, u.prices], key=lambda p: p.valid_from))
        tariff = Tariff(u.option, u.kva, tuple(u.hc_slots), prices)
        self.save(tariff)
        return tariff

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
