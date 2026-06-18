"""Dynamic financial highlights for analysis results."""

from .builder import build_financial_highlights
from .models import to_dict

__all__ = ["build_financial_highlights", "to_dict"]
