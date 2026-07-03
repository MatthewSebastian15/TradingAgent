import hashlib

from tradingagents.llm_optimization.hashing import sha256_json, sha256_text, stable_json_dumps


def test_stable_dumps_is_key_order_insensitive():
    assert stable_json_dumps({"b": 1, "a": 2}) == stable_json_dumps({"a": 2, "b": 1})


def test_stable_dumps_compact_and_unicode():
    assert stable_json_dumps({"a": "é"}) == '{"a":"é"}'


def test_non_json_values_stringified():
    assert stable_json_dumps({"when": object}) == stable_json_dumps({"when": object})


def test_sha256_text_matches_stdlib():
    assert sha256_text("abc") == hashlib.sha256(b"abc").hexdigest()


def test_sha256_json_same_input_same_hash():
    assert sha256_json({"b": [1, 2], "a": None}) == sha256_json({"a": None, "b": [1, 2]})
    assert sha256_json({"a": 1}) != sha256_json({"a": 2})
