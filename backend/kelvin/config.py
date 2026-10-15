from pathlib import Path

from pydantic import SecretStr
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
    med_prm: str = ""
    med_token: SecretStr = SecretStr("")
    med_base_url: str = "https://www.myelectricaldata.fr"
    kelvin_data: Path = Path("./data")
    kelvin_fake: bool = False
    # Simulator only: setup operations that always fail (comma-separated; see overkiz/fake.py).
    kelvin_fake_setup_fail: str = ""
    kelvin_web: Path | None = None
    kelvin_debug: bool = False  # serves /docs, /redoc and /openapi.json
    kelvin_host: str = "127.0.0.1"  # `python -m kelvin`; the Docker image sets 0.0.0.0
    kelvin_port: int = 8000  # the Docker image sets 8080
    # Only behind a trusted reverse proxy: its addresses or networks, comma-separated. Empty
    # means X-Forwarded-* headers are ignored. A wildcard is refused (kelvin.serve).
    kelvin_trusted_proxies: str = ""
    # Optional Host header allowlist, comma-separated; localhost and 127.0.0.1 always pass.
    kelvin_allowed_hosts: str = ""
    tz: str = "Europe/Paris"
