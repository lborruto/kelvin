import math
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from kelvin.billing.slots import Slot as HcSlot
from kelvin.billing.tariff import Prices, TariffUpdate
from kelvin.errors import UserError


class ModeBody(BaseModel):
    mode: Literal["off", "manual", "program"]


class SetpointBody(BaseModel):
    kind: Literal["manual", "comfort", "eco"]
    value: float


class Slot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: str
    end: str


class ProgramBody(BaseModel):
    """Days left out have no comfort slot. Unknown keys are rejected, not dropped."""

    model_config = ConfigDict(extra="forbid")

    monday: list[Slot] = []
    tuesday: list[Slot] = []
    wednesday: list[Slot] = []
    thursday: list[Slot] = []
    friday: list[Slot] = []
    saturday: list[Slot] = []
    sunday: list[Slot] = []

    def week(self) -> dict[str, list[dict[str, str]]]:
        return {day: [s.model_dump() for s in slots] for day, slots in self}


class FeaturesBody(BaseModel):
    window_detection: bool | None = None
    presence_detection: bool | None = None
    name: str | None = None


class LightBody(BaseModel):
    on: bool
    intensity: int | None = Field(default=None, ge=1, le=100)


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
