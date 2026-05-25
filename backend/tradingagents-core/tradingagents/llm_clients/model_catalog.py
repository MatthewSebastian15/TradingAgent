from __future__ import annotations

SUPPORTED_PROVIDERS: frozenset[str] = frozenset(
    {
        "anthropic",
        "deepseek",
        "google",
        "ollama",
        "openai",
        "openrouter",
    }
)

OPEN_MODEL_PROVIDERS: frozenset[str] = frozenset({"ollama", "openrouter"})

DEEPSEEK_CHAT_MODEL = "deepseek-chat"
DEEPSEEK_REASONER_MODEL = "deepseek-reasoner"
DEEPSEEK_STRUCTURED_OUTPUT_UNSUPPORTED_MODELS: frozenset[str] = frozenset({DEEPSEEK_REASONER_MODEL})

MODEL_CATALOG: dict[str, dict[str, list[tuple[str, str]]]] = {
    "openai": {
        "quick": [
            ("GPT-4o Mini - Fast, strong coding and tool use", "gpt-4o-mini"),
            ("GPT-4o - Latest frontier, 128k context", "gpt-4o"),
            ("GPT-4 Turbo - High capability", "gpt-4-turbo"),
        ],
        "deep": [
            ("GPT-4o - Latest frontier, 128k context", "gpt-4o"),
            ("GPT-4 Turbo - High capability", "gpt-4-turbo"),
            ("o1 - Strong reasoning", "o1"),
            ("o1 Mini - Fast reasoning", "o1-mini"),
        ],
    },
    "anthropic": {
        "quick": [
            ("Claude Sonnet 4.6 - Best speed and intelligence balance", "claude-sonnet-4-6"),
            ("Claude Haiku 4.5 - Fast, near-instant responses", "claude-haiku-4-5"),
            ("Claude Sonnet 4.5 - Agents and coding", "claude-sonnet-4-5"),
        ],
        "deep": [
            ("Claude Opus 4.6 - Most intelligent, agents and coding", "claude-opus-4-6"),
            ("Claude Opus 4.5 - Premium, max intelligence", "claude-opus-4-5"),
            ("Claude Sonnet 4.6 - Best speed and intelligence balance", "claude-sonnet-4-6"),
            ("Claude Sonnet 4.5 - Agents and coding", "claude-sonnet-4-5"),
        ],
    },
    "google": {
        "quick": [
            ("Gemini 2.5 Flash - Balanced, stable", "gemini-2.5-flash"),
            ("Gemini 2.5 Flash Lite - Fast, low-cost", "gemini-2.5-flash-lite"),
            ("Gemini 2.0 Flash - Previous generation fast", "gemini-2.0-flash"),
        ],
        "deep": [
            ("Gemini 2.5 Pro - Stable pro model", "gemini-2.5-pro"),
            ("Gemini 2.5 Flash - Balanced, stable", "gemini-2.5-flash"),
            ("Gemini 2.0 Flash - Previous generation fast", "gemini-2.0-flash"),
        ],
    },
    "deepseek": {
        "quick": [
            ("DeepSeek Chat - V3 fast model", DEEPSEEK_CHAT_MODEL),
            ("Custom model ID", "custom"),
        ],
        "deep": [
            ("DeepSeek Reasoner - Thinking model", DEEPSEEK_REASONER_MODEL),
            ("DeepSeek Chat - V3 fast model", DEEPSEEK_CHAT_MODEL),
            ("Custom model ID", "custom"),
        ],
    },
    "ollama": {
        "quick": [
            ("Llama3:latest (8B, local)", "llama3:latest"),
        ],
        "deep": [
            ("Llama3:latest (8B, local)", "llama3:latest"),
        ],
    },
}

KNOWN_MODELS: dict[str, list[str]] = {
    provider: sorted({value for options in modes.values() for _, value in options})
    for provider, modes in MODEL_CATALOG.items()
}
