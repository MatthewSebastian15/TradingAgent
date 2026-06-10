from routes.event_contract import PipelineAgent, PipelineStatus, SseEvent, UI_AGENT_IDS, UI_EVENT_TYPES, UI_PIPELINE_STATUSES
from routes.serializers import AGENT_SEQUENCE


def test_backend_event_contract_exports_ui_known_values():
    assert set(UI_EVENT_TYPES) == {event.value for event in SseEvent}
    assert {"progress", "result", "error", "heartbeat"}.issubset(UI_EVENT_TYPES)
    assert {"started", "running", "completed", "failed", "error", "skipped"}.issubset(UI_PIPELINE_STATUSES)


def test_backend_agent_sequence_uses_contract_ids():
    known_agent_ids = {agent.value for agent in PipelineAgent}
    sequence_agent_ids = {agent_id for agent_id, _name, _message in AGENT_SEQUENCE}
    assert sequence_agent_ids.issubset(known_agent_ids)
    assert {PipelineAgent.CACHE.value, PipelineAgent.PIPELINE.value}.issubset(UI_AGENT_IDS)
