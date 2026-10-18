"""The heating model of daily energy on the outdoor temperature (spec 2026-10-18 §5). Pure, stdlib
only.

E_d = a + b · max(0, Tb − T_d) + ε_d — a three-parameter change-point heating model (ASHRAE
Guideline 14 « 3P heating », PRISM). T_d is the day's outdoor mean (Tn + Tx) / 2, a the baseload
(kWh/day), b the heating sensitivity (kWh per day per °C below Tb), Tb the balance point, found on a
0.5 °C grid. Intervals are two-sided 80 % (LEVEL), conditional on Tb (its own uncertainty is left
out and said so)."""

from __future__ import annotations

import math
from collections.abc import Hashable, Iterable
from dataclasses import dataclass
from statistics import pstdev

LEVEL = 0.8
Z_LEVEL = 1.2815515655446004  # standard normal quantile at (1 + LEVEL) / 2 = 0.9
TB_GRID = tuple(10.0 + 0.5 * i for i in range(21))  # 10.0 … 20.0 °C
TB_CONVENTION = 18.0  # the DJU base (Plan 14): used when no mild day shows the baseload
MIN_FIT_DAYS = 28  # v0.2 normalise.MIN_FIT_DAYS
MIN_HEATING_DAYS = 10  # v0.2
HEATING_DEGREES = 1.0  # v0.2 HEATING_DJU: a « heating day » has at least 1 degree below Tb
MIN_HDD_SD = 1.0  # v0.2 MIN_DJU_SD
MIN_R2 = 0.5  # v0.2
MIN_MILD_DAYS = 7  # days at or above Tb needed to see the baseload
OUTLIER_SD = 3.0
THIN_FIT_DAYS = 90  # under a season: « estimation »
THIN_HEATING_DAYS = 30
ROOM_A_FLOOR_KWH = 0.5


def hdd(t: float, tb: float) -> float:
    """Degrees below the balance point (« degrés sous l’équilibre »)."""
    return max(0.0, tb - t)


def t_quantile(df: int) -> float:
    """Student's t at 0.9 (two-sided 80 %), Cornish–Fisher expansion to 1/ν³: within 0.001 of tables
    for ν ≥ 5 (here ν = n − 2 ≥ 26)."""
    if df < 1:
        raise ValueError("df must be positive")
    z, v = Z_LEVEL, float(df)
    z3, z5, z7 = z**3, z**5, z**7
    return (
        z
        + (z3 + z) / (4 * v)
        + (5 * z5 + 16 * z3 + 3 * z) / (96 * v**2)
        + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * v**3)
    )


@dataclass(frozen=True)
class Line:
    a: float
    b: float
    n: int
    mx: float
    sxx: float
    sse: float
    sst: float

    @property
    def r2(self) -> float:
        return 1 - self.sse / self.sst if self.sst > 0 else 1.0

    @property
    def s2(self) -> float:
        return self.sse / (self.n - 2)

    @property
    def var_b(self) -> float:
        return self.s2 / self.sxx

    @property
    def var_a(self) -> float:
        return self.s2 * (1 / self.n + self.mx**2 / self.sxx)

    @property
    def cov_ab(self) -> float:
        return -self.mx * self.s2 / self.sxx


def ols(points: Iterable[tuple[float, float]]) -> Line | None:
    """y = a + b·x by least squares; None with fewer than 3 points or no spread in x."""
    pts = list(points)
    n = len(pts)
    if n < 3:
        return None
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    if sxx <= 1e-12:
        return None
    b = sum((x - mx) * (y - my) for x, y in pts) / sxx
    a = my - b * mx
    sse = sum((y - a - b * x) ** 2 for x, y in pts)
    sst = sum((y - my) ** 2 for _, y in pts)
    return Line(a, b, n, mx, sxx, max(sse, 0.0), sst)


@dataclass(frozen=True)
class Day:
    key: Hashable  # the day (a date in Kelvin; any hashable here)
    t: float  # outdoor mean, °C
    y: float  # kWh


@dataclass(frozen=True)
class Fit:
    tb: float
    source: str  # "estimated" | "convention" | "given"
    line: Line
    heating_days: int


@dataclass(frozen=True)
class Assessment:
    fit: Fit | None
    why: str | None  # few_days | few_heating_days | poor_fit
    thin: tuple[str, ...]
    outliers: tuple[Day, ...]
    used: tuple[Day, ...]


def _line_at(days: list[Day], tb: float) -> Line | None:
    return ols((hdd(d.t, tb), d.y) for d in days)


def _select(
    days: list[Day], fixed: float | None, source: str
) -> tuple[float, str, Line | None] | str:
    """(Tb, source, line), or the reason nothing fits. Lowest SSE among b > 0; ties: the lower
    Tb."""
    if fixed is not None:
        return fixed, source, _line_at(days, fixed)
    best: tuple[float, Line] | None = None
    any_heat = False
    for tb in TB_GRID:
        if sum(1 for d in days if hdd(d.t, tb) >= HEATING_DEGREES) < MIN_HEATING_DAYS:
            continue
        any_heat = True
        ln = _line_at(days, tb)
        if ln is None or ln.b <= 0:
            continue
        if best is None or ln.sse < best[1].sse - 1e-9:
            best = (tb, ln)
    if best is None:
        return "poor_fit" if any_heat else "few_heating_days"
    tb, ln = best
    if sum(1 for d in days if d.t >= tb) < MIN_MILD_DAYS:
        return TB_CONVENTION, "convention", _line_at(days, TB_CONVENTION)
    return tb, "estimated", ln


def assess(days: Iterable[Day], *, tb: float | None = None, room: bool = False) -> Assessment:
    """Fit the model (Tb estimated, or `tb` given for a room), with one 3-sigma outlier pass, then
    judge it against the validity rules (spec §5.3)."""
    pool = list(days)
    if len(pool) < MIN_FIT_DAYS:
        return Assessment(None, "few_days", (), (), tuple(pool))
    sel = _select(pool, tb, "given")
    if isinstance(sel, str):
        return Assessment(None, sel, (), (), tuple(pool))
    c, src, ln = sel
    outliers: tuple[Day, ...] = ()
    if ln is not None and ln.n > 2 and ln.s2 > 0:
        s = math.sqrt(ln.s2)
        outliers = tuple(d for d in pool if abs(d.y - ln.a - ln.b * hdd(d.t, c)) > OUTLIER_SD * s)
        if outliers:
            gone = {d.key for d in outliers}
            pool = [d for d in pool if d.key not in gone]
            if len(pool) < MIN_FIT_DAYS:
                return Assessment(None, "few_days", (), outliers, tuple(pool))
            fixed = tb if tb is not None else (TB_CONVENTION if src == "convention" else None)
            sel = _select(pool, fixed, src if fixed is not None else "estimated")
            if isinstance(sel, str):
                return Assessment(None, sel, (), outliers, tuple(pool))
            c, src, ln = sel
    xs = [hdd(d.t, c) for d in pool]
    heating = sum(1 for x in xs if x >= HEATING_DEGREES)
    if ln is None or heating < MIN_HEATING_DAYS or pstdev(xs) < MIN_HDD_SD:
        return Assessment(None, "few_heating_days", (), outliers, tuple(pool))
    floor_a = -max(ROOM_A_FLOOR_KWH, 2 * math.sqrt(ln.var_a)) if room else -1e-6
    if ln.b <= 0 or ln.a < floor_a or ln.r2 < MIN_R2:
        return Assessment(None, "poor_fit", (), outliers, tuple(pool))
    thin = tuple(
        reason
        for reason, cond in (
            ("short_history", len(pool) < THIN_FIT_DAYS),
            ("few_cold_days", heating < THIN_HEATING_DAYS),
            ("no_mild_days", src == "convention"),
        )
        if cond
    )
    return Assessment(Fit(c, src, ln, heating), None, thin, outliers, tuple(pool))


def _q(f: Fit) -> float:
    return t_quantile(f.line.n - 2)


def band(f: Fit, t: float) -> tuple[float, float, float]:
    """The fitted mean at outdoor `t` and its 80 % confidence band."""
    ln, x = f.line, hdd(t, f.tb)
    y = ln.a + ln.b * x
    half = _q(f) * math.sqrt(ln.s2 * (1 / ln.n + (x - ln.mx) ** 2 / ln.sxx))
    return y, y - half, y + half


def predict(f: Fit, t: float, sigma_c: float = 0.0) -> tuple[float, float, float]:
    """A new day's kWh at outdoor `t` and its 80 % prediction interval (floored at 0); `sigma_c` the
    assumed error of a forecast `t`, which only matters on a heating day."""
    ln, x = f.line, hdd(t, f.tb)
    y = ln.a + ln.b * x
    var = ln.s2 * (1 + 1 / ln.n + (x - ln.mx) ** 2 / ln.sxx)
    if x > 0:
        var += (ln.b * sigma_c) ** 2
    half = _q(f) * math.sqrt(var)
    return y, max(0.0, y - half), y + half


def coef_range(f: Fit, which: str) -> tuple[float, float]:
    ln = f.line
    v, se = (ln.a, math.sqrt(ln.var_a)) if which == "a" else (ln.b, math.sqrt(ln.var_b))
    return v - _q(f) * se, v + _q(f) * se


def sum_interval(f: Fit, xs: list[float], extra_var: float = 0.0) -> tuple[float, float, float]:
    """The sum of k predicted days with degrees `xs` and its 80 % interval: daily noise k·s², the
    parameters' (co)variance, plus `extra_var` (forecast and normal-weather variance)."""
    ln = f.line
    k, h = len(xs), sum(xs)
    total = k * ln.a + ln.b * h
    var = k * ln.s2 + k * k * ln.var_a + h * h * ln.var_b + 2 * k * h * ln.cov_ab + extra_var
    half = _q(f) * math.sqrt(max(var, 0.0))
    return total, max(0.0, total - half), total + half
