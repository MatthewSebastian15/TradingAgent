from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from tradingagents.llm_optimization.hashing import sha256_text

SCHEMA_VERSION = "v1"


@dataclass(frozen=True)
class ExactLLMCacheKey:
    provider: str
    model: str
    agent_name: str
    schema_name: str
    schema_version: str
    prompt_hash: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "agent_name": self.agent_name,
            "schema_name": self.schema_name,
            "schema_version": self.schema_version,
            "prompt_hash": self.prompt_hash,
        }


def build_exact_cache_key(
    *,
    provider: str,
    model: str,
    agent_name: str,
    schema_name: str,
    prompt: str,
    schema_version: str = SCHEMA_VERSION,
) -> ExactLLMCacheKey:
    return ExactLLMCacheKey(
        provider=provider.lower().strip(),
        model=model.lower().strip(),
        agent_name=agent_name.strip(),
        schema_name=schema_name.strip(),
        schema_version=schema_version,
        prompt_hash=sha256_text(prompt or ""),
    )

