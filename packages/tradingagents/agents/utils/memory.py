"""SQLite-backed decision log for TradingAgents.

Replaces the previous flat-file markdown implementation.
Every write is atomic via a single INSERT/UPDATE. Reading past context
for a specific ticker is a targeted indexed query instead of a full-file scan.

Schema
------
decisions
    id            INTEGER PRIMARY KEY AUTOINCREMENT
    trade_date    TEXT    NOT NULL
    ticker        TEXT    NOT NULL
    rating        TEXT    NOT NULL
    decision      TEXT    NOT NULL   -- rendered markdown of the full decision
    reflection    TEXT               -- added by update_with_outcome()
    raw_return    REAL               -- percent, e.g. 0.05 for +5%
    alpha_return  REAL
    holding_days  INTEGER
    pending       INTEGER NOT NULL DEFAULT 1  -- 1 = pending, 0 = resolved

Index on (ticker, pending) covers the two most common query patterns:
    get_past_context(ticker)  -> WHERE ticker = ? AND pending = 0
    get_pending_entries()     -> WHERE pending = 1
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from tradingagents.agents.utils.rating import parse_rating


class TradingMemoryLog:
    """Append-only SQLite log of trading decisions and reflections."""

    # One connection per thread. SQLite connections are not thread-safe.
    # Connections are keyed by database path so isolated logs do not leak
    # state into each other when tests or multiple graph instances run in
    # the same thread.
    _local = threading.local()

    def __init__(self, config: dict = None):
        cfg = config or {}
        self._db_path: Path | None = None
        path = cfg.get("memory_log_path")
        if path:
            # Accept legacy .md path — change the extension to .db automatically
            # so existing configs do not need to be updated.
            p = Path(path).expanduser()
            if p.suffix.lower() in (".md", ".txt"):
                p = p.with_suffix(".db")
            self._db_path = p
            self._db_path.parent.mkdir(parents=True, exist_ok=True)
            self._init_db()

        self._max_entries = cfg.get("memory_log_max_entries")
        self._ttl_days = cfg.get("memory_log_ttl_days")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @contextmanager
    def _conn(self):
        """Return a per-thread SQLite connection (created lazily)."""
        if self._db_path is None:
            yield None
            return

        db_key = str(self._db_path)
        conns = getattr(self._local, "conns", None)
        if conns is None:
            conns = {}
            self._local.conns = conns

        conn = conns.get(db_key)
        if conn is None:
            conn = sqlite3.connect(db_key, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conns[db_key] = conn
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise

    def _init_db(self) -> None:
        """Create table and indexes if they do not exist yet."""
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS decisions (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    trade_date   TEXT    NOT NULL,
                    ticker       TEXT    NOT NULL,
                    rating       TEXT    NOT NULL,
                    decision     TEXT    NOT NULL,
                    reflection   TEXT,
                    raw_return   REAL,
                    alpha_return REAL,
                    holding_days INTEGER,
                    pending      INTEGER NOT NULL DEFAULT 1
                );
                CREATE INDEX IF NOT EXISTS idx_ticker_pending
                    ON decisions (ticker, pending);
                CREATE INDEX IF NOT EXISTS idx_created_at
                    ON decisions (created_at);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_date_ticker
                    ON decisions (trade_date, ticker);
            """)
            cols = {row[1] for row in conn.execute("PRAGMA table_info(decisions)").fetchall()}
            if "created_at" not in cols:
                conn.execute("ALTER TABLE decisions ADD COLUMN created_at TEXT")
                conn.execute("UPDATE decisions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
            conn.commit()

    # ------------------------------------------------------------------
    # Write path (Phase A)
    # ------------------------------------------------------------------

    def store_decision(
        self,
        ticker: str,
        trade_date: str,
        final_trade_decision: str,
    ) -> None:
        """Insert a pending entry. Idempotent: silently skips duplicates."""
        if self._db_path is None:
            return
        rating = parse_rating(final_trade_decision)
        decision = final_trade_decision.strip()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO decisions
                    (trade_date, ticker, rating, decision, pending)
                VALUES (?, ?, ?, ?, 1)
                """,
                (trade_date, ticker, rating, decision),
            )
            conn.commit()
        self._apply_rotation()

    # ------------------------------------------------------------------
    # Read path
    # ------------------------------------------------------------------

    def load_entries(self) -> list[dict]:
        """Return all rows as a list of dicts."""
        if self._db_path is None:
            return []
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM decisions ORDER BY id ASC").fetchall()
        return [self._row_to_entry(r) for r in rows]

    def get_pending_entries(self) -> list[dict]:
        """Return rows where pending = 1."""
        if self._db_path is None:
            return []
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM decisions WHERE pending = 1 ORDER BY id ASC").fetchall()
        return [self._row_to_entry(r) for r in rows]

    def get_past_context(self, ticker: str, n_same: int = 5, n_cross: int = 3) -> str:
        """Return formatted past context for agent prompt injection.

        Uses two indexed queries instead of scanning the whole file:
          1. Last n_same resolved rows for this ticker.
          2. Last n_cross resolved rows for any other ticker.
        """
        if self._db_path is None:
            return ""

        with self._conn() as conn:
            same_rows = conn.execute(
                """
                SELECT * FROM decisions
                WHERE ticker = ? AND pending = 0
                ORDER BY id DESC LIMIT ?
                """,
                (ticker, n_same),
            ).fetchall()

            cross_rows = conn.execute(
                """
                SELECT * FROM decisions
                WHERE ticker != ? AND pending = 0
                ORDER BY id DESC LIMIT ?
                """,
                (ticker, n_cross),
            ).fetchall()

        same = [self._row_to_entry(r) for r in same_rows]
        cross = [self._row_to_entry(r) for r in cross_rows]

        if not same and not cross:
            return ""

        parts = []
        if same:
            parts.append(f"Past analyses of {ticker} (most recent first):")
            parts.extend(self._format_full(e) for e in same)
        if cross:
            parts.append("Recent cross-ticker lessons:")
            parts.extend(self._format_reflection_only(e) for e in cross)
        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Update path (Phase B)
    # ------------------------------------------------------------------

    def update_with_outcome(
        self,
        ticker: str,
        trade_date: str,
        raw_return: float,
        alpha_return: float,
        holding_days: int,
        reflection: str,
    ) -> None:
        """Mark a pending entry as resolved and attach outcome data."""
        if self._db_path is None:
            return
        with self._conn() as conn:
            conn.execute(
                """
                UPDATE decisions
                SET pending      = 0,
                    raw_return   = ?,
                    alpha_return = ?,
                    holding_days = ?,
                    reflection   = ?
                WHERE trade_date = ? AND ticker = ? AND pending = 1
                """,
                (raw_return, alpha_return, holding_days, reflection, trade_date, ticker),
            )
            conn.commit()
        self._apply_rotation()

    def batch_update_with_outcomes(self, updates: list[dict]) -> None:
        """Apply multiple outcome updates in a single transaction.

        Each element of updates must have keys: ticker, trade_date,
        raw_return, alpha_return, holding_days, reflection.
        """
        if self._db_path is None or not updates:
            return
        normalized_updates = []
        for update in updates:
            normalized = dict(update)
            normalized.setdefault("trade_date", normalized.get("date"))
            normalized_updates.append(normalized)
        with self._conn() as conn:
            conn.executemany(
                """
                UPDATE decisions
                SET pending      = 0,
                    raw_return   = :raw_return,
                    alpha_return = :alpha_return,
                    holding_days = :holding_days,
                    reflection   = :reflection
                WHERE trade_date = :trade_date AND ticker = :ticker AND pending = 1
                """,
                normalized_updates,
            )
            conn.commit()
        self._apply_rotation()

    # ------------------------------------------------------------------
    # Rotation
    # ------------------------------------------------------------------

    def _apply_rotation(self) -> None:
        """Delete old resolved rows using TTL first, then LRU/max-entry rotation."""
        if self._db_path is None:
            return
        with self._conn() as conn:
            if self._ttl_days and self._ttl_days > 0:
                conn.execute(
                    """
                    DELETE FROM decisions
                    WHERE pending = 0
                      AND created_at < datetime('now', ?)
                    """,
                    (f"-{int(self._ttl_days)} days",),
                )

            if self._max_entries and self._max_entries > 0:
                resolved_count = conn.execute("SELECT COUNT(*) FROM decisions WHERE pending = 0").fetchone()[0]

                if resolved_count > self._max_entries:
                    to_drop = resolved_count - self._max_entries
                    conn.execute(
                        """
                        DELETE FROM decisions
                        WHERE id IN (
                            SELECT id FROM decisions
                            WHERE pending = 0
                            ORDER BY id ASC
                            LIMIT ?
                        )
                        """,
                        (to_drop,),
                    )
            conn.commit()

    # ------------------------------------------------------------------
    # Formatters (used by get_past_context)
    # ------------------------------------------------------------------

    @staticmethod
    def _format_return(value: float | None) -> str | None:
        return f"{value:+.1%}" if value is not None else None

    def _row_to_entry(self, row) -> dict:
        entry = dict(row)
        entry["pending"] = bool(entry.get("pending"))
        entry["date"] = entry.get("trade_date")
        entry["raw"] = self._format_return(entry.get("raw_return"))
        entry["alpha"] = self._format_return(entry.get("alpha_return"))
        entry["holding"] = f"{entry['holding_days']}d" if entry.get("holding_days") is not None else None
        return entry

    def _format_full(self, e: dict) -> str:
        raw = f"{e['raw_return']:+.1%}" if e["raw_return"] is not None else "n/a"
        alpha = f"{e['alpha_return']:+.1%}" if e["alpha_return"] is not None else "n/a"
        holding = f"{e['holding_days']}d" if e["holding_days"] is not None else "n/a"
        tag = f"[{e['trade_date']} | {e['ticker']} | {e['rating']} | {raw} | {alpha} | {holding}]"
        parts = [tag, f"DECISION:\n{e['decision']}"]
        if e.get("reflection"):
            parts.append(f"REFLECTION:\n{e['reflection']}")
        return "\n\n".join(parts)

    def _format_reflection_only(self, e: dict) -> str:
        raw = f"{e['raw_return']:+.1%}" if e["raw_return"] is not None else "n/a"
        tag = f"[{e['trade_date']} | {e['ticker']} | {e['rating']} | {raw}]"
        if e.get("reflection"):
            return f"{tag}\n{e['reflection']}"
        text = e["decision"][:300]
        suffix = "..." if len(e["decision"]) > 300 else ""
        return f"{tag}\n{text}{suffix}"
