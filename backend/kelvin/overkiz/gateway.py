from typing import Any, Protocol

from kelvin.overkiz.models import (
    DeviceCommand,
    Event,
    RawDevice,
    RawPlace,
    SetupDevice,
    SetupPlace,
)


class Gateway(Protocol):
    async def login(self) -> None: ...

    async def set_credentials(self, username: str, password: str) -> None:
        """Use these credentials from the next login on."""
        ...

    async def check_credentials(self, username: str, password: str) -> None:
        """Log in once with these credentials, apart from the running session.
        Raises BadCredentialsError if Cozytouch refuses them, GatewayError if unreachable."""
        ...

    async def snapshot(self) -> tuple[RawPlace, list[RawDevice]]:
        """The whole setup (places + devices). Rate-limited by Overkiz: see SetupReadGuard."""
        ...

    async def device_states(self, device_url: str) -> dict[str, Any]:
        """The current states of one device (`GET /setup/devices/{url}/states`)."""
        ...

    async def quotas(self) -> Any:
        """The raw `GET /setup/quotas` answer (remaining quota values; shape undocumented)."""
        ...

    # Setup (spec §2.7): two targeted reads and the five allowed writes. 404 raises
    # SetupNotFoundError; nothing else in /setup is reachable.
    async def read_place(self, oid: str) -> SetupPlace: ...

    async def read_device(self, device_url: str) -> SetupDevice: ...

    async def create_place(self, parent_oid: str, label: str, type_: int) -> str:
        """Create a sub-place; returns its oid."""
        ...

    async def update_place(
        self, oid: str, label: str, type_: int | None, metadata: Any
    ) -> None: ...

    async def delete_place(self, oid: str) -> None: ...

    async def relocate_device(self, device_url: str, place_oid: str) -> None: ...

    async def rename_device(self, device_url: str, label: str) -> None:
        """Set the device's Cozytouch label (updateDeviceName=false)."""
        ...

    async def fetch_events(self) -> list[Event]: ...

    async def execute(self, commands: list[DeviceCommand], label: str) -> str: ...

    async def close(self) -> None: ...
