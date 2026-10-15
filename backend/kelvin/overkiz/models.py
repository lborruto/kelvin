from __future__ import annotations

from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class RawPlace:
    oid: str
    label: str
    children: tuple[RawPlace, ...] = ()
    type: int | None = None


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


@dataclass(frozen=True)
class SetupPlace:
    """One place as `GET /setup/places/{oid}` answers it; sub-places as their oids."""

    oid: str
    label: str
    type: int | None
    metadata: Any = None
    children: tuple[str, ...] = ()


@dataclass(frozen=True)
class SetupDevice:
    """One device's placement and label, as `GET /setup/devices/{url}` answers it."""

    device_url: str
    label: str
    place_oid: str | None


@dataclass(frozen=True)
class DeviceUpdate:
    """`DeviceUpdatedEvent`: a device's label or place changed (in Kelvin or the Cozytouch app)."""

    device_url: str
    place_oid: str | None
    label: str | None


PlaceKind = Literal["created", "updated", "deleted"]


@dataclass(frozen=True)
class PlaceEvent:
    """`PlaceCreated/Updated/DeletedEvent`. pyoverkiz 2.2.2 keeps only the event name, so the
    real listener fills `kind` alone; the simulator can add the oid and label."""

    kind: PlaceKind
    place_oid: str | None = None
    label: str | None = None


SetupEvent = DeviceUpdate | PlaceEvent

Event = StateChange | ExecUpdate | DeviceUpdate | PlaceEvent


def iter_places(root: RawPlace) -> Iterator[RawPlace]:
    yield root
    for child in root.children:
        yield from iter_places(child)


def place_to_dict(p: RawPlace) -> dict[str, Any]:
    return {
        "oid": p.oid,
        "label": p.label,
        "type": p.type,
        "children": [place_to_dict(c) for c in p.children],
    }


def place_from_dict(d: dict[str, Any]) -> RawPlace:
    t = d.get("type")
    return RawPlace(
        oid=d["oid"],
        label=d["label"],
        children=tuple(place_from_dict(c) for c in d.get("children", [])),
        type=t if isinstance(t, int) and not isinstance(t, bool) else None,
    )


def device_to_dict(d: RawDevice) -> dict[str, Any]:
    return asdict(d)


def device_from_dict(d: dict[str, Any]) -> RawDevice:
    return RawDevice(**d)
