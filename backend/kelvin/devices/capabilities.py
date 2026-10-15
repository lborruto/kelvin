"""What a radiator can do (Plan 12): its profile, the commands its devices declare, and the
values its states allow. The web shows a control only when its capability is set; the command
layer refuses anything else (kelvin.commands.translate)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from pyoverkiz.enums import OverkizCommand as C

from kelvin.devices.registry import PROFILES

if TYPE_CHECKING:
    from kelvin.house.model import Radiator

COMFORT_MIN = 12.0
ECO_RANGE = (1.0, 8.0)
MODE_ORDER = ("off", "manual", "program")


@dataclass(frozen=True)
class Capabilities:
    modes: tuple[str, ...] = ()
    manual: tuple[float, float] | None = None
    comfort: tuple[float, float] | None = None
    eco: tuple[float, float] | None = None
    levels: tuple[str, ...] = ()
    program: bool = False
    dryer: tuple[str, ...] = ()
    window_detection: bool = False
    presence_detection: bool = False
    night_light: bool = False
    night_light_intensity: bool = False
    identify: bool = False
    energy: bool = False
    rename: bool = False

    @property
    def boost(self) -> bool:
        """Kelvin's boost and away: « Manuel » with a manual setpoint."""
        return "manual" in self.modes and self.manual is not None

    @property
    def read_only(self) -> bool:
        return not (
            self.modes
            or self.manual
            or self.comfort
            or self.eco
            or self.levels
            or self.program
            or self.dryer
            or self.window_detection
            or self.presence_detection
            or self.night_light
            or self.identify
        )

    def view(self) -> dict[str, Any]:
        def pair(v: tuple[float, float] | None) -> list[float] | None:
            return list(v) if v is not None else None

        return {
            "modes": list(self.modes),
            "manual": pair(self.manual),
            "comfort": pair(self.comfort),
            "eco": pair(self.eco),
            "levels": list(self.levels),
            "program": self.program,
            "dryer": list(self.dryer),
            "window_detection": self.window_detection,
            "presence_detection": self.presence_detection,
            "night_light": self.night_light,
            "night_light_intensity": self.night_light_intensity,
            "identify": self.identify,
            "energy": self.energy,
            "boost": self.boost,
            "rename": self.rename,
            "read_only": self.read_only,
        }


def capabilities(r: Radiator) -> Capabilities:
    energy = "energy" in r.urls
    if r.support == "readonly":
        return Capabilities(energy=energy)
    p = PROFILES[r.kind]
    heater = set(r.commands.get(r.heater_url, []))
    light_url = r.urls.get("light")
    light = set(r.commands.get(light_url, [])) if light_url else set()
    hi = r.max_temperature
    modes = tuple(m for m in MODE_ORDER if m in p.modes) if p.mode_command in heater else ()
    manual = (p.manual_min, hi) if modes and p.setpoint_command in heater else None
    comfort = (
        (COMFORT_MIN, hi) if p.setbacks and C.SET_COMFORT_TEMPERATURE.value in heater else None
    )
    eco = ECO_RANGE if p.setbacks and C.SET_ECO_TEMPERATURE.value in heater else None
    allowed = r.values.get(p.level_state or "")
    levels = (
        tuple(lv for lv in p.levels if not allowed or lv in allowed)
        if p.level_command in heater
        else ()
    )
    allowed = r.values.get(p.dryer_state or "")
    dryer = (
        tuple(
            a
            for a in ("boost", "drying")
            if a in p.dryer_values and (not allowed or p.dryer_values[a] in allowed)
        )
        if p.dryer_command in heater
        else ()
    )
    return Capabilities(
        modes=modes,
        manual=manual,
        comfort=comfort,
        eco=eco,
        levels=levels,
        program=p.program and C.SET_TIME_PROGRAM.value in heater,
        dryer=dryer,
        window_detection=C.SET_OPEN_WINDOW_DETECTION_ACTIVATION.value in heater,
        presence_detection=C.SET_OCCUPANCY_ACTIVATION.value in heater,
        night_light=light_url is not None and {C.ON.value, C.OFF.value} <= light,
        night_light_intensity=light_url is not None and C.SET_INTENSITY.value in light,
        identify=bool({C.IDENTIFY.value, C.WINK.value} & heater),
        energy=energy,
        # Plan 8b: a rename is the heater's Cozytouch label (a setup write), not setName.
        rename=True,
    )
