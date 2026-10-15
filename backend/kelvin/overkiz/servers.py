"""The Overkiz servers Kelvin can log in to (Plan 12).

Ids and names are pyoverkiz's own (`Server`, `SUPPORTED_SERVERS`). The three Cozytouch servers
are one Overkiz endpoint with the Cozytouch login; Kelvin is tested on real hardware on the
Sauter one only. « Experimental » servers are every other pyoverkiz 2.2.2 server that logs in
with an email and a password. Left out: Rexel (an OAuth code from a browser redirect), Somfy
multi-site (`Server.SOMFY`, experimental inside pyoverkiz itself) and the Somfy developer mode
(a local API with a token).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pyoverkiz.const import SUPPORTED_SERVERS
from pyoverkiz.enums import Server

Tier = Literal["cozytouch", "experimental"]

DEFAULT_SERVER: str = Server.SAUTER_COZYTOUCH.value

_COZYTOUCH = (Server.SAUTER_COZYTOUCH, Server.ATLANTIC_COZYTOUCH, Server.THERMOR_COZYTOUCH)
_EXPERIMENTAL = (
    Server.SOMFY_EUROPE,
    Server.SOMFY_AMERICA,
    Server.SOMFY_OCEANIA,
    Server.HI_KUMO_EUROPE,
    Server.HI_KUMO_ASIA,
    Server.HI_KUMO_OCEANIA,
    Server.FLEXOM,
    Server.NEXITY,
    Server.BRANDT,
    Server.HEXAOM_HEXACONNECT,
    Server.SIMU_LIVEIN2,
    Server.UBIWIZZ,
)


@dataclass(frozen=True)
class ServerInfo:
    id: str
    name: str
    tier: Tier

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "tier": self.tier,
            "default": self.id == DEFAULT_SERVER,
        }


def _info(server: Server, tier: Tier) -> ServerInfo:
    return ServerInfo(server.value, SUPPORTED_SERVERS[server].name, tier)


SERVERS: dict[str, ServerInfo] = {
    **{s.value: _info(s, "cozytouch") for s in _COZYTOUCH},
    **{s.value: _info(s, "experimental") for s in _EXPERIMENTAL},
}


def server_info(server_id: str) -> ServerInfo | None:
    return SERVERS.get(server_id)


def is_cozytouch(server_id: str) -> bool:
    info = SERVERS.get(server_id)
    return info is not None and info.tier == "cozytouch"


def server_name(server_id: str) -> str:
    """The server's product name; the id itself when unknown (never translated)."""
    info = SERVERS.get(server_id)
    return info.name if info is not None else server_id
