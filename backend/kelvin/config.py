from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def split_list(value: str) -> list[str]:
    """A comma-separated env value as stripped, non-empty items: " a, b,,c" → ["a", "b", "c"]."""
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    # The environment only. A `.env` file is for the shell (`set -a; . ./.env`) or Docker
    # Compose; reading one here would let the working directory change what Kelvin runs with.
    model_config = SettingsConfigDict(extra="ignore")

    cozy_user: str = ""
    cozy_pass: SecretStr = SecretStr("")
    # The Overkiz server of the home (Plan 12): a pyoverkiz Server id from kelvin.overkiz.servers.
    # Read only when COZY_USER/COZY_PASS create the account file; the file wins afterwards.
    cozy_server: str = "sauter_cozytouch"
    med_prm: str = ""
    med_token: SecretStr = SecretStr("")
    med_base_url: str = "https://www.myelectricaldata.fr"
    # Open-Meteo (Plan 14): fixed public hosts; the environment overrides them for tests only.
    open_meteo_forecast_url: str = "https://api.open-meteo.com"
    open_meteo_historical_url: str = "https://historical-forecast-api.open-meteo.com"
    open_meteo_archive_url: str = "https://archive-api.open-meteo.com"
    open_meteo_geocoding_url: str = "https://geocoding-api.open-meteo.com"
    kelvin_data: Path = Path("./data")
    kelvin_fake: bool = False
    # Simulator only: setup operations that always fail (comma-separated; see overkiz/fake.py).
    kelvin_fake_setup_fail: str = ""
    # Simulator house (Plan 12): sauter, atlantic, thermor or experimental. Empty: the house of
    # the server chosen at login (sauter by default).
    kelvin_fake_house: Literal["", "sauter", "atlantic", "thermor", "experimental"] = ""
    kelvin_web: Path | None = None
    kelvin_debug: bool = False  # serves /docs, /redoc and /openapi.json
    kelvin_mcp: bool = True  # the read-only MCP endpoint at /mcp (Plan 13); no token, no access
    kelvin_host: str = "127.0.0.1"  # `python -m kelvin`; the Docker image sets 0.0.0.0
    kelvin_port: int = 8000  # the Docker image sets 8080
    # Only behind a trusted reverse proxy: its addresses or networks, comma-separated. Empty
    # means X-Forwarded-* headers are ignored. A wildcard is refused (kelvin.serve).
    kelvin_trusted_proxies: str = ""
    # Optional Host header allowlist, comma-separated; localhost and 127.0.0.1 always pass.
    kelvin_allowed_hosts: str = ""
    tz: str = "Europe/Paris"

    @field_validator("cozy_server")
    @classmethod
    def _known_server(cls, v: str) -> str:
        from kelvin.overkiz.servers import SERVERS  # pyoverkiz import kept out of module load

        v = v.strip()
        if v not in SERVERS:
            raise ValueError(f"COZY_SERVER must be one of: {', '.join(SERVERS)}")
        return v
