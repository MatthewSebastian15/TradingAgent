"""Base classes and shared contracts for TradingAgents nodes.

The project still exposes factory functions for compatibility with the graph
builder, but these abstract classes give every new agent a consistent shape:
name, role, state input, and dictionary output. That lowers coupling between
agent modules and graph wiring.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Protocol, TypeAlias

AgentStateLike: TypeAlias = Mapping[str, Any]
AgentOutput: TypeAlias = dict[str, Any]
AgentCallable: TypeAlias = Callable[[AgentStateLike], AgentOutput]


class SupportsInvoke(Protocol):
    """Minimal LLM protocol used by agent nodes."""

    def invoke(self, input: Any, *args: Any, **kwargs: Any) -> Any:
        """Invoke an LLM or chain."""


@dataclass(slots=True)
class AgentMetadata:
    """Human-readable metadata for an agent node."""

    name: str
    role: str
    output_key: str | None = None


class BaseAgentNode(ABC):
    """Abstract base class for all graph-compatible agent nodes."""

    metadata: AgentMetadata

    def __init__(self, llm: Any, metadata: AgentMetadata) -> None:
        self.llm = llm
        self.metadata = metadata

    @property
    def name(self) -> str:
        """Return the display name used in logs and graph events."""

        return self.metadata.name

    @abstractmethod
    def __call__(self, state: AgentStateLike) -> AgentOutput:
        """Run the agent against the current graph state."""


class ToolCallingAgentNode(BaseAgentNode):
    """Base class for agents that call LangChain tools."""

    @abstractmethod
    def tools(self, state: AgentStateLike) -> list[Any]:
        """Return the tools available for this state."""


class StructuredOutputAgentNode(BaseAgentNode):
    """Base class for agents that prefer typed structured output."""

    structured_llm: Any | None = None

    @abstractmethod
    def build_prompt(self, state: AgentStateLike) -> Any:
        """Build the model input for this agent."""
