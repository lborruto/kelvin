"""The access log never carries what a weather request was about (spec §4: the place is private).

uvicorn's access log line holds the full path with its query string. A filter on the
`uvicorn.access` logger cuts the query string of every `/api/weather` request (a search's text,
a chart window), so neither a typed town nor anything else of the kind reaches stdout or Docker's
logs. The search itself is a POST with the text in the body; this filter is the backstop."""

from __future__ import annotations

import logging

PRIVATE_PREFIXES = ("/api/weather", "/api/settings/weather")
ACCESS_LOGGER = "uvicorn.access"


class RedactWeatherQueries(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            path = args[2]
            if "?" in path and path.startswith(PRIVATE_PREFIXES):
                record.args = (*args[:2], path.split("?", 1)[0], *args[3:])
        return True


def install() -> None:
    """Idempotent: one filter on uvicorn's access logger (uvicorn logs its access lines on that
    logger itself, so the logger's filter sees every one)."""
    logger = logging.getLogger(ACCESS_LOGGER)
    if not any(isinstance(f, RedactWeatherQueries) for f in logger.filters):
        logger.addFilter(RedactWeatherQueries())
