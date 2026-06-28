import unittest
import warnings

import pytest

from tradingagents.llm_clients.base_client import BaseLLMClient

try:
    from config import KNOWN_MODELS

    def get_known_models():
        return KNOWN_MODELS
except ImportError:
    from tradingagents.llm_clients.validators import KNOWN_MODELS

    def get_known_models():
        return KNOWN_MODELS


from tradingagents.llm_clients.validators import validate_model


class DummyLLMClient(BaseLLMClient):
    def __init__(self, provider: str, model: str):
        self.provider = provider
        super().__init__(model)

    def get_llm(self):
        self.warn_if_unknown_model()
        return object()

    def validate_model(self) -> bool:
        return validate_model(self.provider, self.model)


@pytest.mark.unit
class ModelValidationTests(unittest.TestCase):
    def test_cli_catalog_models_are_all_validator_approved(self):
        for provider, models in get_known_models().items():
            for model in models:
                with self.subTest(provider=provider, model=model):
                    self.assertTrue(validate_model(provider, model))

    def test_validator_accepts_known_models_with_mixed_case(self):
        self.assertTrue(validate_model("google", "gemini-3.5-Flash"))
        self.assertTrue(validate_model("google", "gemini-3.1-Flash-Lite"))

    def test_unknown_model_emits_warning_for_strict_provider(self):
        client = DummyLLMClient("openai", "not-a-real-openai-model")

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client.get_llm()

        self.assertEqual(len(caught), 1)
        self.assertIn("not-a-real-openai-model", str(caught[0].message))
        self.assertIn("openai", str(caught[0].message))

    def test_unknown_provider_accepts_custom_models_without_warning(self):
        # Forward-compatibility: a provider with no catalog accepts any model.
        client = DummyLLMClient("some-future-provider", "custom-model-name")

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            client.get_llm()

        self.assertEqual(caught, [])
