"""Runtime configuration for yfinance.

Keep all yfinance imports behind this module so Docker workers use the same
writable timezone cache directory. This prevents noisy messages such as:
"Failed to create TzCache ... TzCache will not be used".
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import yfinance as yf

logger = logging.getLogger(__name__)


def _default_cache_dir() -> Path:
    """Return the yfinance cache directory used by the Docker backend."""
    configured = os.getenv("YFINANCE_CACHE_DIR")
    if configured:
        return Path(configured).expanduser()

    xdg_cache_home = os.getenv("XDG_CACHE_HOME")
    if xdg_cache_home:
        return Path(xdg_cache_home).expanduser() / "py-yfinance"

    return Path.home() / ".cache" / "py-yfinance"


def configure_yfinance_cache() -> Path | None:
    """Configure yfinance timezone cache to a writable directory.

    yfinance supports set_tz_cache_location(cache_dir). The directory must be
    writable in Docker, including subprocesses spawned by the analysis pipeline.
    Returning None means configuration failed and yfinance will fall back to its
    own default behavior.
    """
    cache_dir = _default_cache_dir()

    try:
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Fail fast if the mounted Docker volume is not writable.
        test_file = cache_dir / ".write_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)

        yf.set_tz_cache_location(str(cache_dir))
        logger.info("yfinance timezone cache configured: %s", cache_dir)
        return cache_dir
    except Exception:
        logger.warning(
            "Could not configure yfinance timezone cache at %s; yfinance will use its default behavior.",
            cache_dir,
            exc_info=True,
        )
        return None


YFINANCE_TZ_CACHE_DIR = configure_yfinance_cache()
