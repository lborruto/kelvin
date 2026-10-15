import pytest


class ManualClock:
    """Deterministic clock: call it to read, .advance(s) to move forward."""

    def __init__(self, start: float = 1_000.0) -> None:
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


@pytest.fixture(autouse=True)
def _no_real_credentials(monkeypatch):
    """A developer shell may export real Cozytouch or Linky credentials: hide them from tests."""
    for name in ("COZY_USER", "COZY_PASS", "MED_TOKEN", "MED_PRM"):
        monkeypatch.delenv(name, raising=False)


DEMO = {"email": "demo@kelvin.local", "password": "kelvin"}


async def login(client) -> None:
    """Log in through the real flow with the simulator's demo account."""
    r = await client.post("/api/auth/login", json=DEMO, headers={"X-Kelvin": "1"})
    assert r.status_code == 200, r.text


def err(code: str, **params) -> dict:
    """The JSON body of a user error: its unchanged French detail, its code, its params."""
    from kelvin.errors import french

    return {"detail": french(code, params), "code": code, "params": params}
