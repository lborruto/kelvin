"""The access log never carries a weather request's query (spec §4; review of Plan 14)."""

import logging

from uvicorn.logging import AccessFormatter

from kelvin.api.accesslog import ACCESS_LOGGER, RedactWeatherQueries, install
from kelvin.api.app import create_app
from kelvin.config import Settings


def line(path: str) -> str:
    """One uvicorn access line for `path`, as uvicorn's httptools/h11 protocols log it."""
    record = logging.LogRecord(
        ACCESS_LOGGER,
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", path, "1.1", 200),
        None,
    )
    RedactWeatherQueries().filter(record)
    return AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s').format(record)


def test_weather_queries_are_cut_from_the_access_log():
    assert "Chamonix" not in line("/api/weather/search?q=Chamonix&lang=fr")
    assert line("/api/weather/search?q=Chamonix") == (
        '127.0.0.1:5000 - "GET /api/weather/search HTTP/1.1" 200 OK'
    )
    assert "start=" not in line("/api/weather/hourly?start=1&end=2")
    assert "/api/energy?from=2026-01-01" in line(
        "/api/energy?from=2026-01-01"
    )  # other routes keep it


def test_the_app_installs_the_filter_once(tmp_path):
    logger = logging.getLogger(ACCESS_LOGGER)
    before = [f for f in logger.filters if isinstance(f, RedactWeatherQueries)]
    for f in before:
        logger.removeFilter(f)
    create_app(Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), start_tasks=False)
    install()
    assert len([f for f in logger.filters if isinstance(f, RedactWeatherQueries)]) == 1


def test_a_real_access_record_is_redacted(caplog):
    install()
    caplog.set_level(logging.INFO, logger=ACCESS_LOGGER)
    logging.getLogger(ACCESS_LOGGER).info(
        '%s - "%s %s HTTP/%s" %d', "127.0.0.1:5000", "GET", "/api/weather/search?q=Lyon", "1.1", 200
    )
    assert "Lyon" not in caplog.text and "/api/weather/search" in caplog.text
