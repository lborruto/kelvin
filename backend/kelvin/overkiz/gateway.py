from typing import Protocol

from kelvin.overkiz.models import DeviceCommand, Event, RawDevice, RawPlace


class Gateway(Protocol):
    async def login(self) -> None: ...

    async def set_credentials(self, username: str, password: str) -> None:
        """Use these credentials from the next login on."""
        ...

    async def check_credentials(self, username: str, password: str) -> None:
        """Log in once with these credentials, apart from the running session.
        Raises BadCredentialsError if Cozytouch refuses them, GatewayError if unreachable."""
        ...

    async def snapshot(self) -> tuple[RawPlace, list[RawDevice]]: ...

    async def fetch_events(self) -> list[Event]: ...

    async def execute(self, commands: list[DeviceCommand], label: str) -> str: ...

    async def close(self) -> None: ...
