"""The home's Cozytouch account and Linky credentials (spec §3.7).

They live in $KELVIN_DATA/account.json, mode 0600. With the env vars, it is the only place these
secrets exist: never git, logs, API responses or the SQLite DB. Nothing in this module logs a value.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from kelvin.config import Settings

log = logging.getLogger(__name__)
ACCOUNT_FILE = "account.json"


class AccountFileError(Exception):
    """account.json exists but cannot be read. Startup stops with this message (kelvin.serve)."""


@dataclass(frozen=True, repr=False)
class Account:
    email: str
    password: str
    med_prm: str | None = None
    med_token: str | None = None

    def __repr__(self) -> str:
        return f"Account(<hidden>, linky={'set' if self.med_token else 'unset'})"

    __str__ = __repr__

    def same_email(self, email: str) -> bool:
        return self.email.strip().casefold() == email.strip().casefold()

    def to_json(self) -> dict[str, Any]:
        return {
            "email": self.email,
            "password": self.password,
            "linky": {"prm": self.med_prm, "token": self.med_token},
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> Account:
        linky = data.get("linky") or {}
        return cls(
            email=str(data["email"]),
            password=str(data["password"]),
            med_prm=linky.get("prm"),
            med_token=linky.get("token"),
        )


class AccountStore:
    def __init__(self, data_dir: Path) -> None:
        self.path = Path(data_dir) / ACCOUNT_FILE

    def load(self) -> Account | None:
        if not self.path.exists():
            return None
        mode = stat.S_IMODE(self.path.stat().st_mode)
        if mode & 0o077:
            os.chmod(self.path, 0o600)
            log.warning("account file mode was %o; reset to 600", mode)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("not a JSON object")
            return Account.from_json(data)
        except (ValueError, KeyError, TypeError, AttributeError) as e:
            # `from None`: the parser's message could quote the file, which holds the password.
            raise AccountFileError(
                f"{self.path} cannot be read ({type(e).__name__}). Restore it from a backup, "
                "or delete it and log in again with the home's Cozytouch account."
            ) from None

    def save(self, account: Account) -> None:
        """Atomic write: a crash never leaves a half-written or world-readable file."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".account.", suffix=".tmp")
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w") as f:
                json.dump(account.to_json(), f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(tmp)
            raise
        os.chmod(self.path, 0o600)


def bootstrap_account(settings: Settings, store: AccountStore) -> Account | None:
    """Startup (§3.7): the account file wins; else COZY_USER/COZY_PASS create it; else None
    (setup mode: the first login decides the home's account)."""
    account = store.load()
    if account is not None:
        if settings.cozy_user:
            log.info("account file present; COZY_USER/COZY_PASS ignored")
        return account
    password = settings.cozy_pass.get_secret_value()
    if settings.cozy_user.strip() and password:
        account = Account(settings.cozy_user.strip(), password)
        store.save(account)
        log.info("account file created from COZY_USER/COZY_PASS")
        return account
    return None


def linky_credentials(account: Account | None, settings: Settings) -> tuple[str, str] | None:
    """(PDL, token) from the account file, else MED_PRM/MED_TOKEN (the env is a fallback, §3.5)."""
    if account is not None and account.med_prm and account.med_token:
        return account.med_prm, account.med_token
    token = settings.med_token.get_secret_value()
    if settings.med_prm and token:
        return settings.med_prm, token
    return None
