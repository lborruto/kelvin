"""Grid signals (spec §2.3): the Tempo calendar (RTE) and the EcoWatt signal (RTE), both read
from MyElectricalData's public endpoints. A colour is `blue`, `white` or `red`; an EcoWatt level
is 1 (green), 2 (orange) or 3 (red)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(frozen=True)
class EcowattDay:
    day: date
    level: int  # 1 green, 2 orange, 3 red
    hours: tuple[int | None, ...] | None  # 24 local hours, when their dating is known


class GridError(Exception):
    """A grid source failed or answered something unexpected. Never carries a payload or URL."""


class GridThrottled(GridError):
    def __init__(self, retry_at: float | None) -> None:
        super().__init__("throttled")
        self.retry_at = retry_at


class GridSource(Protocol):
    async def tempo(self, start: date, end: date) -> dict[date, str]:
        """Published colours for [start, end); unpublished days are absent."""
        ...

    async def ecowatt(self, start: date, end: date) -> dict[date, EcowattDay]: ...

    async def tempo_prices(self) -> dict[str, float]: ...

    async def aclose(self) -> None: ...
