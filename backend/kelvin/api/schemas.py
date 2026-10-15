import math
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from kelvin.billing.slots import Slot as HcSlot
from kelvin.billing.tariff import Prices, TariffUpdate
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
    name: str | None = None


class LightBody(BaseModel):
    on: bool
    # No schema bound: `plan_light` refuses 0 or 101 with the worded `intensity_range`.
    intensity: int | None = None


class BoostBody(BaseModel):
    temperature: float
    duration_min: int = Field(ge=15, le=720)


class AwayBody(BaseModel):
    until: datetime
    temperature: float = 12.0


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


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


class SettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tariff: TariffBody


class LinkyBody(BaseModel):
    """The PDL and the token are checked by the route (UserError codes, never echoed)."""

    model_config = ConfigDict(extra="forbid")

    prm: str = Field(max_length=64)
    token: str | None = Field(default=None, max_length=512)
