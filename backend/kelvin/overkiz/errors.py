class GatewayError(Exception):
    """Overkiz is unreachable or refused the request."""


class UnansweredError(GatewayError):
    """No answer came back (a timeout, a connection dropped after it opened): Overkiz may have
    taken the request all the same. A command sent this way can still run."""


class QuotaError(GatewayError):
    """Overkiz rate limit (QUOTA_EXCEEDED / too many requests or executions)."""


class AuthError(GatewayError):
    """Login failed or session expired."""


class BadCredentialsError(AuthError):
    """Cozytouch refused the email or password (not a mere expired session)."""


class SetupBudgetSpent(GatewayError):
    """Kelvin's own daily budget of full setup reads is spent (no call was made)."""


class SetupNotFoundError(GatewayError):
    """Overkiz answered 404 for a place or a device (deleted, or never there)."""
