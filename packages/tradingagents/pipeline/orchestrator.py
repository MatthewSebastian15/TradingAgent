"""Balanced market data orchestration entry points."""

from __future__ import annotations

from tradingagents.pipeline import builders as _builders
from tradingagents.pipeline import collectors as _collectors
from tradingagents.pipeline import quality as _quality
from tradingagents.pipeline.types import FieldQualityContext

_MODULES = (_builders, _quality, _collectors)


def _link_split_modules() -> dict[str, object]:
    exports = {}
    for module in _MODULES:
        exports.update(
            {name: getattr(module, name) for name in dir(module) if not name.startswith("__")}
        )
    exports["FieldQualityContext"] = FieldQualityContext
    for module in _MODULES:
        for name, value in exports.items():
            if name not in module.__dict__:
                module.__dict__[name] = value
    return exports


_EXPORTS = _link_split_modules()
globals().update(_EXPORTS)

collect_market_data = _collectors.collect_market_data
run_cross_vendor_validation = _collectors.run_cross_vendor_validation
_check_cancel = _collectors._check_cancel
_source_label = _builders._source_label
latest_date_from_rows = _builders.latest_date_from_rows
latest_news_published_at = _builders.latest_news_published_at
latest_financial_as_of = _builders.latest_financial_as_of
latest_price_as_of = _builders.latest_price_as_of
latest_corporate_action_as_of = _builders.latest_corporate_action_as_of

__all__ = sorted(_EXPORTS)
