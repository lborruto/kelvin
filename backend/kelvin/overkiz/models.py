from __future__ import annotations

from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class RawPlace:
    oid: str
    label: str
    children: tuple[RawPlace, ...] = ()


@dataclass
class RawDevice:
    device_url: str
    label: str
    widget: str
    place_oid: str | None
    states: dict[str, Any] = field(default_factory=dict)
    commands: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class DeviceCommand:
    device_url: str
    name: str
    parameters: tuple[Any, ...] = ()


@dataclass(frozen=True)
class StateChange:
    device_url: str
    name: str
    value: Any


@dataclass(frozen=True)
class ExecUpdate:
    exec_id: str
    state: str
    failure: str | None = None


Event = StateChange | ExecUpdate


def iter_places(root: RawPlace) -> Iterator[RawPlace]:
    yield root
    for child in root.children:
        yield from iter_places(child)


def place_to_dict(p: RawPlace) -> dict[str, Any]:
    return {"oid": p.oid, "label": p.label, "children": [place_to_dict(c) for c in p.children]}


def place_from_dict(d: dict[str, Any]) -> RawPlace:
    return RawPlace(
        oid=d["oid"],
        label=d["label"],
        children=tuple(place_from_dict(c) for c in d.get("children", [])),
    )


def device_to_dict(d: RawDevice) -> dict[str, Any]:
    return asdict(d)


def device_from_dict(d: dict[str, Any]) -> RawDevice:
    return RawDevice(**d)
