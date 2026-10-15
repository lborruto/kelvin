import math
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from kelvin.billing.slots import Slot as HcSlot
from kelvin.billing.tariff import (
    HcSchedule,
    HcVariant,
    PriceRow,
    Prices,
    Tariff,
    TariffUpdate,
    TempoHours,
)
from kelvin.errors import UserError
from kelvin.house.model import DAY_ORDER


class ModeBody(BaseModel):
    mode: Literal["off", "manual", "program"]


class SetpointBody(BaseModel):
    kind: Literal["manual", "comfort", "eco"]
    value: float


class Slot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: str
    end: str


DayName = Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


class ProgramBody(BaseModel):
    """Only the days the body names are written (`[]` clears a day); a day left out, or listed in
    `keep`, is re-sent exactly as each radiator reported it (final review C1: a send to several
    rooms or radiators must never empty a day it does not mean to change). Unknown keys are
    rejected, not dropped.

    `base`: per radiator, the programme the editor started from. When it no longer matches what
    the radiator reports (changed in the Cozytouch app or another tab), the send is refused unless
    `force` (owner addition, 2026-10-14)."""

    model_config = ConfigDict(extra="forbid")

    monday: list[Slot] | None = None
    tuesday: list[Slot] | None = None
    wednesday: list[Slot] | None = None
    thursday: list[Slot] | None = None
    friday: list[Slot] | None = None
    saturday: list[Slot] | None = None
    sunday: list[Slot] | None = None
    # Days to leave as each radiator reported them, even when the body also names them.
    keep: list[DayName] = Field(default=[], max_length=7)
    base: dict[str, dict[DayName, Annotated[list[Slot], Field(max_length=3)]]] | None = Field(
        default=None, max_length=50
    )
    force: bool = False

    def week(self) -> dict[str, list[dict[str, str]]]:
        """The days to write: those the body names and does not keep."""
        kept = self.kept()
        return {
            day: [s.model_dump() for s in slots]
            for day in DAY_ORDER
            if (slots := getattr(self, day)) is not None and day not in kept
        }

    def kept(self) -> set[str]:
        return set(self.keep)

    def base_programs(self) -> dict[str, dict[str, list[dict[str, str]]]] | None:
        if self.base is None:
            return None
        return {
            rid: {day: [s.model_dump() for s in slots] for day, slots in prog.items()}
            for rid, prog in self.base.items()
        }


class FeaturesBody(BaseModel):
    window_detection: bool | None = None
    presence_detection: bool | None = None
    name: str | None = Field(default=None, max_length=200)  # 1–32 after trim: setup/validate


class LabelBody(BaseModel):
    label: str = Field(max_length=200)  # the real rule (1–32 after trim) is checked in setup/


class MoveBody(BaseModel):
    room_id: str = Field(min_length=1, max_length=200)


class LightBody(BaseModel):
    on: bool
    # No schema bound: `plan_light` refuses 0 or 101 with the worded `intensity_range`.
    intensity: int | None = None


class LevelBody(BaseModel):
    """A pilot-wire heater's level (Plan 12)."""

    level: Literal["comfort", "comfort-1", "comfort-2", "eco", "frostprotection", "off"]


class DryerBody(BaseModel):
    """A towel dryer's boost or drying; `stop` goes back to normal heating (Plan 12)."""

    action: Literal["boost", "drying", "stop"]


class BoostBody(BaseModel):
    temperature: float
    duration_min: int = Field(ge=15, le=720)


class AwayBody(BaseModel):
    until: datetime
    temperature: float = 12.0


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
    # Plan 12: an id from GET /api/auth/servers. Omitted: the home's server, else Sauter.
    server: str | None = Field(default=None, max_length=40)

    def chosen_server(self) -> str | None:
        """None when the body names no server (the home's once claimed, else Sauter). A server
        given as null or blank is a wrong choice (server_unknown), not an omission."""
        if "server" not in self.model_fields_set:
            return None
        return (self.server or "").strip()


class HcSlotBody(BaseModel):
    """Times are checked by the billing slots, which raise UserError codes (kelvin/errors.py)."""

    model_config = ConfigDict(extra="forbid")

    start: str
    end: str


def _price(value: float, upper: float, code: str) -> float:
    if not math.isfinite(value) or not 0 < value < upper:
        raise UserError(code)
    return value


class TariffBody(BaseModel):
    """Option, power and slots are checked by TariffStore.update; the prices here
    (UserError codes (kelvin/errors.py), so the route answers 422 with them)."""

    model_config = ConfigDict(extra="forbid")

    option: str = "hchp"
    kva: int
    hc_slots: list[HcSlotBody]
    subscription_eur_month: float
    hc_eur_kwh: float
    hp_eur_kwh: float
    valid_from: date

    def to_update(self) -> TariffUpdate:
        prices = Prices(
            self.valid_from,
            _price(self.subscription_eur_month, 1000, code="price_subscription_invalid"),
            _price(self.hc_eur_kwh, 10, code="price_hc_invalid"),
            _price(self.hp_eur_kwh, 10, code="price_hp_invalid"),
        )
        return TariffUpdate(
            kva=self.kva,
            hc_slots=tuple(HcSlot(s.start, s.end) for s in self.hc_slots),
            prices=prices,
            option=self.option,
        )


class PriceRowBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid_from: date
    option: str = Field(max_length=10)
    subscription_eur_month: float
    rates: dict[Annotated[str, Field(max_length=16)], float] = Field(max_length=6)


class HcVariantBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    months: list[int] = Field(min_length=1, max_length=12)
    slots: list[HcSlotBody] = Field(min_length=1, max_length=3)


class HcScheduleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid_from: date
    variants: list[HcVariantBody] = Field(min_length=1, max_length=4)


class TempoHoursBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hc_start: str = Field(default="22:00", max_length=5)
    hc_end: str = Field(default="06:00", max_length=5)
    day_start: str | None = None  # echoed back by clients; fixed at 06:00, ignored


class TariffDocBody(BaseModel):
    """The tariff v2 document (spec §2.2), replaced as a whole. Codes come from
    `Tariff.validate` (kelvin/errors.py)."""

    model_config = ConfigDict(extra="forbid")

    kva: int
    prices: list[PriceRowBody] = Field(max_length=100)
    hc_schedules: list[HcScheduleBody] = Field(default_factory=list, max_length=24)
    tempo_hours: TempoHoursBody = Field(default_factory=TempoHoursBody)

    def to_tariff(self) -> Tariff:
        return Tariff.build(
            self.kva,
            [
                PriceRow.make(p.valid_from, p.option, p.subscription_eur_month, p.rates)
                for p in self.prices
            ],
            [
                HcSchedule(
                    s.valid_from,
                    tuple(
                        HcVariant(tuple(v.months), tuple(HcSlot(x.start, x.end) for x in v.slots))
                        for v in s.variants
                    ),
                )
                for s in self.hc_schedules
            ],
            TempoHours(self.tempo_hours.hc_start, self.tempo_hours.hc_end),
        )


class SettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tariff: TariffDocBody | TariffBody


class LinkyBody(BaseModel):
    """The PDL and the token are checked by the route (UserError codes, never echoed)."""

    model_config = ConfigDict(extra="forbid")

    prm: str = Field(max_length=64)
    token: str | None = Field(default=None, max_length=512)
