"""
Lightweight in-memory vector store for jurisdiction-specific building code chunks.
Uses TF-IDF (scikit-learn) for embeddings — no external model download required.
Chunks are tagged by jurisdiction tier: "city", "state", or "irc".
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

JurisdictionTier = Literal["city", "state", "irc"]

_IRC_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "building_codes" / "irc_baseline.txt"


@dataclass
class CodeChunk:
    text: str
    tier: JurisdictionTier
    city: str = ""   # lowercase, e.g. "dallas"
    state: str = ""  # lowercase 2-letter abbr, e.g. "tx"


class JurisdictionVectorStore:
    """
    Stores code chunks per jurisdiction and retrieves the most relevant ones
    for a compliance query using TF-IDF cosine similarity.

    Priority during retrieval:
      1. City-level chunks (highest weight)
      2. State-level chunks
      3. IRC baseline (always included as fallback)
    """

    def __init__(self) -> None:
        self._chunks: list[CodeChunk] = []
        self._vectorizer: TfidfVectorizer | None = None
        self._matrix = None
        self._dirty = True  # rebuild vectorizer when chunks change

        # Load IRC baseline at startup
        self._load_irc_baseline()

    def _load_irc_baseline(self) -> None:
        if not _IRC_PATH.exists():
            logger.warning("IRC baseline file not found at %s", _IRC_PATH)
            return
        raw = _IRC_PATH.read_text(encoding="utf-8")
        chunks = _split_into_chunks(raw)
        for chunk in chunks:
            self._chunks.append(CodeChunk(text=chunk, tier="irc"))
        self._dirty = True
        logger.info("Loaded %d IRC baseline chunks", len(chunks))

    def add_chunks(self, chunks: list[str], tier: JurisdictionTier, city: str = "", state: str = "") -> None:
        """Add jurisdiction-specific code chunks. Deduplicates by first 80 chars."""
        existing_heads = {c.text[:80] for c in self._chunks}
        added = 0
        for text in chunks:
            if text[:80] not in existing_heads:
                self._chunks.append(CodeChunk(text=text, tier=tier, city=city.lower(), state=state.lower()))
                existing_heads.add(text[:80])
                added += 1
        if added:
            self._dirty = True
            logger.info("Added %d %s chunks for %s/%s", added, tier, city, state)

    def _rebuild(self) -> None:
        if not self._chunks:
            return
        texts = [c.text for c in self._chunks]
        self._vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_df=0.95)
        self._matrix = self._vectorizer.fit_transform(texts)
        self._dirty = False

    def retrieve(self, query: str, city: str, state: str, top_k: int = 10) -> list[str]:
        """
        Return up to top_k code chunks most relevant to the query for the given
        jurisdiction. City chunks are boosted 2×, state chunks 1.5×, IRC 1×.
        """
        if self._dirty:
            self._rebuild()
        if self._vectorizer is None or self._matrix is None:
            return []

        city_l = city.lower()
        state_l = state.lower()

        q_vec = self._vectorizer.transform([query])
        scores = cosine_similarity(q_vec, self._matrix).flatten()

        # Apply jurisdiction boost
        boosted = []
        for i, chunk in enumerate(self._chunks):
            boost = 1.0
            if chunk.tier == "city" and chunk.city == city_l and chunk.state == state_l:
                boost = 2.0
            elif chunk.tier == "state" and chunk.state == state_l:
                boost = 1.5
            boosted.append((scores[i] * boost, i))

        boosted.sort(key=lambda x: x[0], reverse=True)
        results = [self._chunks[i].text for _, i in boosted[:top_k] if scores[i] > 0.01]

        # Always include at least a few IRC baseline chunks if results are thin
        if len(results) < 4:
            irc_chunks = [(scores[i], i) for i, c in enumerate(self._chunks) if c.tier == "irc"]
            irc_chunks.sort(key=lambda x: x[0], reverse=True)
            for score, i in irc_chunks[:4]:
                text = self._chunks[i].text
                if text not in results:
                    results.append(text)

        return results[:top_k]

    def has_jurisdiction(self, city: str, state: str, tier: JurisdictionTier) -> bool:
        city_l, state_l = city.lower(), state.lower()
        return any(
            c.tier == tier and c.city == city_l and c.state == state_l
            for c in self._chunks
        )


def _split_into_chunks(text: str, max_tokens: int = 150) -> list[str]:
    """Split text into chunks on blank lines or IRC section headers, ~300 tokens max."""
    # Split on blank lines first
    raw_blocks = re.split(r"\n{2,}", text.strip())
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for block in raw_blocks:
        block = block.strip()
        if not block:
            continue
        word_count = len(block.split())
        if current_len + word_count > max_tokens and current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(block)
        current_len += word_count

    if current:
        chunks.append("\n\n".join(current))

    return [c for c in chunks if len(c.strip()) > 20]


# Singleton instance — loaded once at startup
code_store = JurisdictionVectorStore()
