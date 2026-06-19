from __future__ import annotations


class ErrorCode:
    MISSING_API_KEY = "missing_api_key"
    VENDOR_TIMEOUT = "vendor_timeout"
    VENDOR_QUOTA_ERROR = "vendor_quota_error"
    VENDOR_EMPTY_RESPONSE = "vendor_empty_response"
    VENDOR_SCHEMA_ERROR = "vendor_schema_error"
    VENDOR_AUTH_ERROR = "vendor_auth_error"
    VENDOR_UNSUPPORTED = "vendor_unsupported_symbol"
    VENDOR_BUDGET_EXCEEDED = "vendor_budget_exceeded"

    SYMBOL_NOT_FOUND = "symbol_not_found"
    SYMBOL_NOT_VERIFIED = "symbol_not_verified"
    SYMBOL_AMBIGUOUS = "symbol_ambiguous"

    PIPELINE_TIMEOUT = "pipeline_timeout"
    PARTIAL_RESULT = "partial_result"
    LLM_BUDGET_EXCEEDED = "llm_budget_exceeded"
    LLM_SCHEMA_INVALID = "llm_schema_invalid"
    DATA_QUALITY_BLOCKING = "data_quality_blocking"

    DATA_STALE = "data_stale"
    DATA_PARTIAL = "data_partial"
    DATA_CONFLICT = "data_conflict"
    COVERAGE_UNVERIFIED = "coverage_unverified"


def normalize_provider_status(status: str) -> str:
    mapping = {
        "timeout": ErrorCode.VENDOR_TIMEOUT,
        "rate_limited": ErrorCode.VENDOR_QUOTA_ERROR,
        "invalid_api_key": ErrorCode.VENDOR_AUTH_ERROR,
        "server_error": ErrorCode.VENDOR_EMPTY_RESPONSE,
        "unknown_error": ErrorCode.VENDOR_SCHEMA_ERROR,
        "unavailable": ErrorCode.VENDOR_EMPTY_RESPONSE,
        "budget_exceeded": ErrorCode.VENDOR_BUDGET_EXCEEDED,
    }
    return mapping.get(str(status or ""), str(status or ErrorCode.VENDOR_SCHEMA_ERROR))
