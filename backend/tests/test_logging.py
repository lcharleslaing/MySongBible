import logging
from pathlib import Path

from app.core.logging import configure_logging


def test_configure_logging_writes_backend_log_file(tmp_path: Path) -> None:
    configure_logging("INFO", tmp_path)

    logging.getLogger("app.tests.logging").info("file logging works")
    for handler in logging.getLogger().handlers:
        handler.flush()

    log_path = tmp_path / "backend-app.log"
    assert log_path.exists()
    assert "file logging works" in log_path.read_text(encoding="utf-8")
