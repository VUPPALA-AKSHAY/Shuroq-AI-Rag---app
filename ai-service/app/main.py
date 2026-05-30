from __future__ import annotations

import hashlib
import json
import math
import os
import pickle
import re
import traceback
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from httpx import HTTPError
from pydantic import BaseModel, Field

SERVICE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(SERVICE_ROOT / ".env", override=False)
load_dotenv(PROJECT_ROOT / "backend" / ".env", override=False)

# Bypass broken proxy envs.
for key in ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]:
    if os.getenv(key):
        os.environ.pop(key, None)

app = FastAPI(title="CHATB AI Service", version="0.2.0")

@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, error: Exception) -> JSONResponse:
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "message": "AI service query failed",
                "reason": str(error),
                "type": error.__class__.__name__,
            }
        },
    )

DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
DEFAULT_CEREBRAS_MODEL = os.getenv("CEREBRAS_MODEL", "glm-5")
DEFAULT_CHAT_MODEL = os.getenv("AI_MODEL", os.getenv("CEREBRAS_MODEL", DEFAULT_CEREBRAS_MODEL))
DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "fastembed").lower()
LOCAL_EMBEDDING_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "local-hash-embedding-768")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_EMBEDDING_URL = "https://generativelanguage.googleapis.com/v1beta/{model}:embedContent"
GEMINI_BATCH_EMBEDDING_URL = "https://generativelanguage.googleapis.com/v1beta/{model}:batchEmbedContents"
GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"
CEREBRAS_CHAT_COMPLETIONS_URL = "https://api.frenix.sh/v1/chat/completions"
STRICT_PDF_REFUSAL = "I don't have that information in the selected document."
STRICT_PDF_SYSTEM_PROMPT = (
    "You are an assistant inside a document-grounded app.\n"
    "You MUST answer using only the provided selected document text.\n"
    "Do NOT use outside knowledge or assumptions.\n"
    f"If the selected document text does not contain the answer, respond with exactly:\n{STRICT_PDF_REFUSAL}\n"
    "Return only the final answer. Do not include analysis, plans, or constraint lists."
)

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default

def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default

STORE_FILE = os.getenv("VECTOR_STORE_FILE", "vector_store.pkl")
EMBEDDING_DIMENSION = _env_int("EMBEDDING_DIMENSION", 768)
EMBEDDING_BATCH_SIZE = max(1, min(_env_int("EMBEDDING_BATCH_SIZE", 16), 64))
CHUNK_CHARS = max(400, _env_int("RAG_CHUNK_CHARS", 2500))
CHUNK_OVERLAP_CHARS = max(0, _env_int("RAG_CHUNK_OVERLAP_CHARS", 400))
LEXICAL_SCAN_LIMIT = max(100, _env_int("RAG_LEXICAL_SCAN_LIMIT", 1500))
DENSE_CANDIDATE_MULTIPLIER = max(2, _env_int("RAG_DENSE_CANDIDATE_MULTIPLIER", 5))
LEXICAL_CANDIDATE_MULTIPLIER = max(2, _env_int("RAG_LEXICAL_CANDIDATE_MULTIPLIER", 5))
RRF_K = max(1, _env_int("RAG_RRF_K", 60))
DENSE_WEIGHT = max(0.0, _env_float("RAG_DENSE_WEIGHT", 0.65))
LEXICAL_WEIGHT = max(0.0, _env_float("RAG_LEXICAL_WEIGHT", 0.35))
SUPPLIED_CONTEXT_CHARS = max(1000, _env_int("RAG_SUPPLIED_CONTEXT_CHARS", 8000))
DIRECT_CONTEXT_CHARS = max(
    4000,
    _env_int("RAG_DIRECT_CONTEXT_CHARS", _env_int("RAG_DIRECT_DOCUMENT_CONTEXT_CHARS", 32000)),
)
SOURCE_CONTEXT_CHARS = max(1000, _env_int("RAG_SOURCE_CONTEXT_CHARS", 300000))
CEREBRAS_MAX_TOKENS = max(512, _env_int("CEREBRAS_MAX_TOKENS", 4096))

QDRANT_URL = (os.getenv("QDRANT_URL") or "").rstrip("/")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "chatb_chunks")
QDRANT_COLLECTION_MODE = os.getenv("QDRANT_COLLECTION_MODE", "per-workspace").lower()

TOKEN_RE = re.compile(r"[a-z0-9_]+", re.IGNORECASE)
FASTEMBED_CLIENT: Any | None = None
FASTEMBED_CACHE_DIR = Path(os.getenv("FASTEMBED_CACHE_PATH", str(SERVICE_ROOT / ".cache" / "fastembed")))

@dataclass
class Chunk:
    id: str
    workspace_id: str
    file_id: str
    file_name: str
    text: str
    metadata: dict[str, Any]
    created_at: str
    embedding: list[float] | None = None

@dataclass
class RetrievalHit:
    chunk: Chunk
    dense_score: float = 0.0
    lexical_score: float = 0.0
    dense_rank: int | None = None
    lexical_rank: int | None = None
    fusion_score: float = 0.0

class QdrantError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code

VECTOR_STORE: dict[str, list[Chunk]] = defaultdict(list)

def _coerce_chunk(value: Any) -> Chunk | None:
    if isinstance(value, Chunk):
        if not hasattr(value, "embedding"):
            value.embedding = None
        if value.metadata is None:
            value.metadata = {}
        return value

    if not isinstance(value, dict):
        return None

    required = ["id", "workspace_id", "file_id", "file_name", "text", "created_at"]
    if any(not value.get(key) for key in required):
        return None

    return Chunk(
        id=str(value["id"]),
        workspace_id=str(value["workspace_id"]),
        file_id=str(value["file_id"]),
        file_name=str(value["file_name"]),
        text=str(value["text"]),
        metadata=value.get("metadata") or {},
        created_at=str(value["created_at"]),
        embedding=value.get("embedding"),
    )

def load_store() -> None:
    global VECTOR_STORE
    if not os.path.exists(STORE_FILE):
        return

    try:
        with open(STORE_FILE, "rb") as f:
            loaded = pickle.load(f)

        raw_workspaces = loaded.get("workspaces", loaded) if isinstance(loaded, dict) else {}
        next_store: dict[str, list[Chunk]] = defaultdict(list)
        for workspace_id, chunks in raw_workspaces.items():
            if workspace_id == "version":
                continue
            for raw_chunk in chunks or []:
                chunk = _coerce_chunk(raw_chunk)
                if chunk:
                    next_store[str(workspace_id)].append(chunk)

        VECTOR_STORE = defaultdict(list, next_store)
        print(f"Loaded {sum(len(v) for v in VECTOR_STORE.values())} chunks from {STORE_FILE}")
    except Exception as error:
        print(f"Failed to load vector store: {error}")

def save_store() -> None:
    try:
        with open(STORE_FILE, "wb") as f:
            pickle.dump({"version": 2, "workspaces": dict(VECTOR_STORE)}, f)
    except Exception as error:
        print(f"Failed to save vector store: {error}")

@app.on_event("startup")
def startup_event() -> None:
    load_store()

def _model_resource(model: str) -> str:
    return model if model.startswith("models/") else f"models/{model}"

def _model_path_name(model: str) -> str:
    return model.removeprefix("models/")

def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text or "")]

def _split_long_text(text: str, chunk_chars: int) -> list[str]:
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for word in words:
        word_len = len(word) + 1
        if current and current_len + word_len > chunk_chars:
            chunks.append(" ".join(current))
            current = [word]
            current_len = word_len
        else:
            current.append(word)
            current_len += word_len

    if current:
        chunks.append(" ".join(current))
    return chunks

def _split_text(text: str, chunk_chars: int = CHUNK_CHARS) -> list[str]:
    text = text.strip()
    if not text:
        return []

    pieces: list[str] = []
    for paragraph in [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]:
        if len(paragraph) <= chunk_chars:
            pieces.append(paragraph)
        else:
            pieces.extend(_split_long_text(paragraph, chunk_chars))

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for piece in pieces:
        piece_len = len(piece)
        if current and current_len + piece_len > chunk_chars:
            chunks.append("\n\n".join(current))
            current = [piece]
            current_len = piece_len
        else:
            current.append(piece)
            current_len += piece_len

    if current:
        chunks.append("\n\n".join(current))

    if CHUNK_OVERLAP_CHARS <= 0 or len(chunks) <= 1:
        return chunks

    overlapped = [chunks[0]]
    for previous, chunk in zip(chunks, chunks[1:]):
        prefix = previous[-CHUNK_OVERLAP_CHARS:].strip()
        overlapped.append(f"{prefix}\n\n{chunk}" if prefix else chunk)
    return overlapped

def _split_tabular_text(text: str, chunk_chars: int = CHUNK_CHARS) -> list[str] | None:
    """Row-aware chunking for tabular data.

    Keeps column headers (File, Type, Columns, Summary, etc.) in EVERY chunk
    so each chunk is self-contained and searchable. Returns None if the content
    does not look tabular.
    """
    lines = text.strip().split('\n')
    rows_start = -1
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.lower().startswith('rows:'):
            rows_start = i
            break

    if rows_start < 0:
        return None

    header_lines = lines[:rows_start]
    marker_line = lines[rows_start].strip()

    if marker_line.lower() == 'rows:':
        data_lines = lines[rows_start + 1:]
        header_text = '\n'.join(header_lines).strip() + '\nRows:'
    else:
        after = marker_line[len('Rows:'):].strip() if len(marker_line) > 5 else ''
        header_text = '\n'.join(header_lines).strip() + '\nRows:'
        data_lines = ([after] if after else []) + lines[rows_start + 1:]

    data_lines = [line for line in data_lines if line.strip()]
    if not data_lines:
        return None

    chunks: list[str] = []
    current_rows: list[str] = []
    current_len = len(header_text) + 1

    for row_line in data_lines:
        row_line = row_line.strip()
        if not row_line:
            continue
        row_len = len(row_line) + 1
        if current_rows and current_len + row_len > chunk_chars:
            chunks.append(header_text + '\n' + '\n'.join(current_rows))
            current_rows = [row_line]
            current_len = len(header_text) + 1 + row_len
        else:
            current_rows.append(row_line)
            current_len += row_len

    if current_rows:
        chunks.append(header_text + '\n' + '\n'.join(current_rows))

    return chunks if chunks else None

_AGGREGATE_RE = re.compile(
    r'\b(all|every|each|list|which|how many|count|total|complete|entire|enumerate|'
    r'show me all|give me all|find all|what are|show all)\b',
    re.IGNORECASE,
)
_ORDER_POSITION_RE = re.compile(
    r'\b(first|last|final|latest|earliest|opening|beginning|start|starting|end|ending|'
    r'previous|next|before|after|preceding|following)\b',
    re.IGNORECASE,
)
_ORDER_TARGET_RE = re.compile(
    r'\b(question|answer|item|point|section|heading|topic|entry|row|record|paragraph|page|line)\b',
    re.IGNORECASE,
)
_QUESTION_TARGET_RE = re.compile(r'\b(question|questions|qna|q&a)\b', re.IGNORECASE)
_TAIL_POSITION_RE = re.compile(r'\b(last|final|latest|end|ending)\b', re.IGNORECASE)
_HEAD_POSITION_RE = re.compile(r'\b(first|earliest|opening|beginning|start|starting)\b', re.IGNORECASE)
_NUMBERED_QUESTION_RE = re.compile(r'(?<!\d)(\d{1,4})\.\s+([A-Z][^?]{3,280}\?)')
_QUESTION_SENTENCE_RE = re.compile(r'(?:(?<=^)|(?<=[.!?\n]\s))([A-Z][^?]{5,240}\?)')

def _is_aggregate_query(question: str) -> bool:
    """Detect queries that require exhaustive scanning of all data rows."""
    return bool(_AGGREGATE_RE.search(question))

def _is_order_sensitive_query(question: str) -> bool:
    """Detect prompts that need original document order, not semantic ranking."""
    if not question:
        return False

    if not _ORDER_POSITION_RE.search(question):
        return False

    normalized = question.lower()
    return bool(
        _ORDER_TARGET_RE.search(question)
        or "at the end" in normalized
        or "at the beginning" in normalized
        or "from the end" in normalized
        or "from the start" in normalized
    )

def _order_focus(question: str) -> str:
    if _TAIL_POSITION_RE.search(question):
        return "tail"
    if _HEAD_POSITION_RE.search(question):
        return "head"
    return "ordered"

def _is_question_boundary_query(question: str) -> bool:
    return bool(
        _QUESTION_TARGET_RE.search(question)
        and (_HEAD_POSITION_RE.search(question) or _TAIL_POSITION_RE.search(question))
    )

def _requested_boundary_count(question: str) -> int:
    match = re.search(
        r'\b(?:first|last|final|latest|earliest|top|bottom)\s+(\d{1,3})\b',
        question,
        re.IGNORECASE,
    )
    if not match:
        return 1

    try:
        return max(1, min(int(match.group(1)), 50))
    except ValueError:
        return 1

def _safe_collection_suffix(workspace_id: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_-]+", "_", workspace_id).strip("_")
    digest = hashlib.sha1(workspace_id.encode("utf-8")).hexdigest()[:10]
    if not clean:
        clean = digest
    if len(clean) > 48:
        clean = f"{clean[:36]}_{digest}"
    return clean

def _collection_name(workspace_id: str) -> str:
    if QDRANT_COLLECTION_MODE == "global":
        return QDRANT_COLLECTION
    return f"{QDRANT_COLLECTION}_{_safe_collection_suffix(workspace_id)}"

def _qdrant_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if QDRANT_API_KEY:
        headers["api-key"] = QDRANT_API_KEY
    return headers

async def _qdrant_request(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    tolerate_404: bool = False,
) -> dict[str, Any] | None:
    if not QDRANT_URL:
        raise QdrantError(503, "QDRANT_URL is not configured")

    try:
        async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
            response = await client.request(
                method,
                f"{QDRANT_URL}{path}",
                headers=_qdrant_headers(),
                json=json,
            )
    except HTTPError as error:
        raise QdrantError(502, f"Could not connect to Qdrant: {error}") from error

    if response.status_code == 404 and tolerate_404:
        return None

    if response.status_code >= 400:
        raise QdrantError(response.status_code, response.text[:1000])

    return response.json() if response.content else {}

async def _ensure_qdrant_collection(collection_name: str) -> None:
    collection_path = quote(collection_name, safe="")
    exists = await _qdrant_request(
        "GET",
        f"/collections/{collection_path}",
        tolerate_404=True,
    )
    if exists is not None:
        vectors = (exists.get("result") or {}).get("config", {}).get("params", {}).get("vectors", {})
        existing_size = None
        if isinstance(vectors, dict):
            if isinstance(vectors.get("size"), int):
                existing_size = vectors.get("size")
            elif "default" in vectors and isinstance(vectors["default"], dict):
                maybe_size = vectors["default"].get("size")
                if isinstance(maybe_size, int):
                    existing_size = maybe_size

        if existing_size is None or existing_size == EMBEDDING_DIMENSION:
            return
        if QDRANT_COLLECTION_MODE != "global":
            await _qdrant_request("DELETE", f"/collections/{collection_path}", tolerate_404=True)
        else:
            raise QdrantError(
                409,
                f"Qdrant collection vector size is {existing_size}; expected {EMBEDDING_DIMENSION}",
            )

    try:
        await _qdrant_request(
            "PUT",
            f"/collections/{collection_path}",
            json={
                "vectors": {
                    "size": EMBEDDING_DIMENSION,
                    "distance": "Cosine",
                }
            },
        )
    except QdrantError as error:
        msg = str(error).lower()
        if "already exists" not in msg:
            raise

    for field_name in ["workspace_id", "file_id", "file_name"]:
        try:
            await _qdrant_request(
                "PUT",
                f"/collections/{collection_path}/index",
                json={"field_name": field_name, "field_schema": "keyword"},
            )
        except QdrantError:
            pass

def _qdrant_filter(workspace_id: str, extra: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    must = [{"key": "workspace_id", "match": {"value": workspace_id}}]
    must.extend(extra or [])
    return {"must": must}

def _payload_from_chunk(chunk: Chunk) -> dict[str, Any]:
    return {
        "workspace_id": chunk.workspace_id,
        "file_id": chunk.file_id,
        "file_name": chunk.file_name,
        "text": chunk.text,
        "metadata": chunk.metadata,
        "created_at": chunk.created_at,
        "embedding_model": LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL,
        "embedding_provider": EMBEDDING_PROVIDER,
        "embedding_dimension": EMBEDDING_DIMENSION,
    }

def _chunk_from_qdrant_point(point: dict[str, Any]) -> Chunk | None:
    payload = point.get("payload") or {}
    if not payload.get("text"):
        return None

    return Chunk(
        id=str(point.get("id") or payload.get("chunk_id") or uuid4()),
        workspace_id=str(payload.get("workspace_id") or ""),
        file_id=str(payload.get("file_id") or ""),
        file_name=str(payload.get("file_name") or "unknown"),
        text=str(payload.get("text") or ""),
        metadata=payload.get("metadata") or {},
        created_at=str(payload.get("created_at") or ""),
        embedding=None,
    )

async def _qdrant_upsert_chunks(workspace_id: str, chunks: list[Chunk]) -> None:
    if not QDRANT_URL or not chunks:
        return

    collection = _collection_name(workspace_id)
    await _ensure_qdrant_collection(collection)
    collection_path = quote(collection, safe="")
    points = [
        {
            "id": chunk.id,
            "vector": chunk.embedding,
            "payload": _payload_from_chunk(chunk),
        }
        for chunk in chunks
        if chunk.embedding
    ]

    if points:
        await _qdrant_request(
            "PUT",
            f"/collections/{collection_path}/points?wait=true",
            json={"points": points},
        )

async def _qdrant_delete_file_identifiers(workspace_id: str, identifiers: list[str]) -> None:
    if not QDRANT_URL or not identifiers:
        return

    collection = _collection_name(workspace_id)
    collection_path = quote(collection, safe="")
    existing = await _qdrant_request(
        "GET",
        f"/collections/{collection_path}",
        tolerate_404=True,
    )
    if existing is None:
        return

    for identifier in identifiers:
        for key in ["file_id", "file_name"]:
            await _qdrant_request(
                "POST",
                f"/collections/{collection_path}/points/delete?wait=true",
                json={
                    "filter": _qdrant_filter(
                        workspace_id,
                        [{"key": key, "match": {"value": identifier}}],
                    )
                },
            )

def _file_filter_conditions(file_id: str | None = None, file_name: str | None = None) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = []
    if file_id:
        filters.append({"key": "file_id", "match": {"value": file_id}})
    if file_name:
        filters.append({"key": "file_name", "match": {"value": file_name}})
    return filters

def _chunk_matches_file(chunk: Chunk, file_id: str | None = None, file_name: str | None = None) -> bool:
    if file_id:
        return chunk.file_id == file_id
    if file_name:
        return chunk.file_name == file_name
    return True

async def _qdrant_scroll_chunks(
    workspace_id: str,
    limit: int,
    file_id: str | None = None,
    file_name: str | None = None,
) -> list[Chunk]:
    if not QDRANT_URL:
        return []

    collection = _collection_name(workspace_id)
    collection_path = quote(collection, safe="")
    offset: Any = None
    chunks: list[Chunk] = []

    while len(chunks) < limit:
        body: dict[str, Any] = {
            "limit": min(256, limit - len(chunks)),
            "with_payload": True,
            "with_vector": False,
            "filter": _qdrant_filter(workspace_id, _file_filter_conditions(file_id, file_name)),
        }
        if offset is not None:
            body["offset"] = offset

        data = await _qdrant_request(
            "POST",
            f"/collections/{collection_path}/points/scroll",
            json=body,
            tolerate_404=True,
        )
        if not data:
            break

        result = data.get("result") or {}
        points = result.get("points") or []
        for point in points:
            chunk = _chunk_from_qdrant_point(point)
            if chunk:
                chunks.append(chunk)

        offset = result.get("next_page_offset")
        if not points or offset is None:
            break

    return chunks

async def _qdrant_dense_search(
    workspace_id: str,
    query_embedding: list[float],
    limit: int,
    file_id: str | None = None,
    file_name: str | None = None,
) -> list[tuple[float, Chunk]]:
    if not QDRANT_URL:
        return []

    collection = _collection_name(workspace_id)
    collection_path = quote(collection, safe="")
    body = {
        "vector": query_embedding,
        "limit": limit,
        "with_payload": True,
        "with_vector": False,
        "filter": _qdrant_filter(workspace_id, _file_filter_conditions(file_id, file_name)),
    }

    data = await _qdrant_request(
        "POST",
        f"/collections/{collection_path}/points/search",
        json=body,
        tolerate_404=True,
    )
    if not data:
        return []

    points = data.get("result") or []
    results: list[tuple[float, Chunk]] = []
    for point in points:
        chunk = _chunk_from_qdrant_point(point)
        if chunk:
            results.append((float(point.get("score") or 0.0), chunk))
    return results

def _delete_local_file_identifiers(workspace_id: str, identifiers: list[str]) -> int:
    if not identifiers:
        return 0

    identifiers_set = set(identifiers)
    existing = VECTOR_STORE.get(workspace_id, [])
    kept = [
        chunk
        for chunk in existing
        if chunk.file_id not in identifiers_set and chunk.file_name not in identifiers_set
    ]
    removed = len(existing) - len(kept)
    VECTOR_STORE[workspace_id] = kept
    if removed:
        save_store()
    return removed

def _local_workspace_chunks(
    workspace_id: str,
    file_id: str | None = None,
    file_name: str | None = None,
) -> list[Chunk]:
    return [
        chunk
        for chunk in VECTOR_STORE.get(workspace_id, [])
        if _chunk_matches_file(chunk, file_id, file_name)
    ]

async def _workspace_chunks_for_lexical(
    workspace_id: str,
    file_id: str | None = None,
    file_name: str | None = None,
) -> list[Chunk]:
    merged: dict[str, Chunk] = {
        chunk.id: chunk
        for chunk in _local_workspace_chunks(workspace_id, file_id, file_name)
    }

    if QDRANT_URL and len(merged) < LEXICAL_SCAN_LIMIT:
        try:
            for chunk in await _qdrant_scroll_chunks(workspace_id, LEXICAL_SCAN_LIMIT, file_id, file_name):
                merged.setdefault(chunk.id, chunk)
        except QdrantError as error:
            print(f"Qdrant lexical scroll failed: {error}")

    return list(merged.values())

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if not norm_a or not norm_b:
        return 0.0
    return dot / (norm_a * norm_b)

def _dense_search_local(
    workspace_id: str,
    query_embedding: list[float],
    limit: int,
    file_id: str | None = None,
    file_name: str | None = None,
) -> list[tuple[float, Chunk]]:
    scored: list[tuple[float, Chunk]] = []
    for chunk in _local_workspace_chunks(workspace_id, file_id, file_name):
        if not chunk.embedding:
            continue
        score = _cosine_similarity(query_embedding, chunk.embedding)
        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[:limit]

def _lexical_search(question: str, chunks: list[Chunk], limit: int) -> list[tuple[float, Chunk]]:
    q_tokens = _tokenize(question)
    if not q_tokens or not chunks:
        return []

    tokenized_docs = [_tokenize(chunk.text) for chunk in chunks]
    total_docs = len(tokenized_docs)
    avg_doc_len = sum(len(tokens) for tokens in tokenized_docs) / max(total_docs, 1)
    doc_freq: Counter[str] = Counter()

    for tokens in tokenized_docs:
        doc_freq.update(set(tokens))

    k1 = 1.5
    b = 0.75
    query_terms = Counter(q_tokens)
    scored: list[tuple[float, Chunk]] = []

    for chunk, doc_tokens in zip(chunks, tokenized_docs):
        if not doc_tokens:
            continue

        freqs = Counter(doc_tokens)
        doc_len = len(doc_tokens)
        score = 0.0

        for term, query_tf in query_terms.items():
            tf = freqs.get(term, 0)
            if tf <= 0:
                continue
            df = doc_freq.get(term, 0)
            idf = math.log(1 + ((total_docs - df + 0.5) / (df + 0.5)))
            denom = tf + k1 * (1 - b + b * doc_len / max(avg_doc_len, 1))
            score += query_tf * idf * ((tf * (k1 + 1)) / denom)

        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[:limit]

def _normalized_scores(results: list[tuple[float, Chunk]]) -> dict[str, float]:
    positive_scores = [max(score, 0.0) for score, _ in results]
    max_score = max(positive_scores, default=0.0)
    if max_score <= 0:
        return {}
    return {chunk.id: max(score, 0.0) / max_score for score, chunk in results}

def _chunk_index(chunk: Chunk) -> int:
    metadata = chunk.metadata if isinstance(chunk.metadata, dict) else {}
    try:
        return int(metadata.get("chunk_index", 0))
    except (TypeError, ValueError):
        return 0

def _chunk_count(chunk: Chunk) -> int | None:
    metadata = chunk.metadata if isinstance(chunk.metadata, dict) else {}
    try:
        value = metadata.get("chunk_count")
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None

def _ordered_chunks(chunks: list[Chunk]) -> list[Chunk]:
    unique: dict[str, Chunk] = {}
    for chunk in chunks:
        unique.setdefault(chunk.id, chunk)

    return sorted(
        unique.values(),
        key=lambda chunk: (
            chunk.file_name or "",
            chunk.file_id or "",
            _chunk_index(chunk),
            chunk.created_at,
            chunk.id,
        ),
    )

def _ordered_hits(chunks: list[Chunk]) -> list[RetrievalHit]:
    total = max(len(chunks), 1)
    hits: list[RetrievalHit] = []
    for position, chunk in enumerate(chunks, start=1):
        score = 1.0 - ((position - 1) / total)
        hits.append(
            RetrievalHit(
                chunk=chunk,
                lexical_rank=position,
                lexical_score=score,
                fusion_score=score,
            )
        )
    return hits

def _clean_extracted_question(question: str) -> str:
    cleaned = re.sub(r"\s+", " ", question or "").strip()
    cleaned = re.sub(r"\s+([?.!,;:])", r"\1", cleaned)
    cleaned = re.sub(r"\b(is|in|for|with|and|or|to|of|the|a|an)([A-Z][a-z])", r"\1 \2", cleaned)
    return cleaned

def _extract_ordered_questions(chunks: list[Chunk]) -> list[dict[str, Any]]:
    ordered = _ordered_chunks(chunks)
    text = " ".join(chunk.text for chunk in ordered)
    text = re.sub(r"\s+", " ", text)

    by_number: dict[int, dict[str, Any]] = {}
    for match in _NUMBERED_QUESTION_RE.finditer(text):
        number = int(match.group(1))
        question = _clean_extracted_question(match.group(2))
        if not question or len(question) < 6:
            continue
        by_number[number] = {
            "number": number,
            "question": question,
            "position": match.start(),
        }

    if by_number:
        return sorted(by_number.values(), key=lambda item: item["number"])

    questions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in _QUESTION_SENTENCE_RE.finditer(text):
        question = _clean_extracted_question(match.group(1))
        key = question.lower()
        if key in seen:
            continue
        seen.add(key)
        questions.append({
            "number": None,
            "question": question,
            "position": match.start(),
        })

    return questions

def _format_question_item(item: dict[str, Any]) -> str:
    number = item.get("number")
    question = item.get("question") or ""
    return f"{number}. {question}" if number is not None else question

def _answer_question_boundaries(question: str, chunks: list[Chunk]) -> str | None:
    if not _is_question_boundary_query(question):
        return None

    extracted = _extract_ordered_questions(chunks)
    if not extracted:
        return None

    wants_first = bool(_HEAD_POSITION_RE.search(question))
    wants_last = bool(_TAIL_POSITION_RE.search(question))
    count = _requested_boundary_count(question)

    if wants_first and wants_last and count == 1:
        return "\n".join([
            f"First question: {extracted[0]['question']}",
            f"Last question: {extracted[-1]['question']}",
        ])

    sections: list[str] = []
    if wants_first:
        first_items = extracted[:count]
        if count == 1:
            sections.append(f"First question: {first_items[0]['question']}")
        else:
            sections.append(
                "First questions:\n" + "\n".join(_format_question_item(item) for item in first_items)
            )

    if wants_last:
        last_items = extracted[-count:]
        if count == 1:
            sections.append(f"Last question: {last_items[-1]['question']}")
        else:
            sections.append(
                "Last questions:\n" + "\n".join(_format_question_item(item) for item in last_items)
            )

    return "\n\n".join(sections) if sections else None

def _fuse_results(
    dense_results: list[tuple[float, Chunk]],
    lexical_results: list[tuple[float, Chunk]],
    top_k: int,
) -> list[RetrievalHit]:
    candidates: dict[str, RetrievalHit] = {}
    dense_norm = _normalized_scores(dense_results)
    lexical_norm = _normalized_scores(lexical_results)

    for rank, (_, chunk) in enumerate(dense_results, start=1):
        hit = candidates.setdefault(chunk.id, RetrievalHit(chunk=chunk))
        hit.dense_rank = rank
        hit.dense_score = dense_norm.get(chunk.id, 0.0)

    for rank, (_, chunk) in enumerate(lexical_results, start=1):
        hit = candidates.setdefault(chunk.id, RetrievalHit(chunk=chunk))
        hit.lexical_rank = rank
        hit.lexical_score = lexical_norm.get(chunk.id, 0.0)

    for hit in candidates.values():
        if hit.dense_rank is not None:
            hit.fusion_score += DENSE_WEIGHT / (RRF_K + hit.dense_rank)
        if hit.lexical_rank is not None:
            hit.fusion_score += LEXICAL_WEIGHT / (RRF_K + hit.lexical_rank)
        hit.fusion_score += 0.001 * (
            DENSE_WEIGHT * hit.dense_score + LEXICAL_WEIGHT * hit.lexical_score
        )

    ranked = sorted(candidates.values(), key=lambda hit: hit.fusion_score, reverse=True)
    return ranked[:top_k]

def _truncate_source_context(text: str, max_chars: int, focus: str = "head") -> str:
    if len(text) <= max_chars:
        return text

    if focus == "tail":
        marker = "...[earlier document evidence omitted; preserved the end of the document]\n"
        keep = max_chars - len(marker)
        if keep <= 0:
            return text[-max_chars:].lstrip()
        return marker + text[-keep:].lstrip()

    return _truncate_text(text, max_chars)

def _excerpt(text: str, question: str, max_chars: int = 2000) -> str:
    clean = " ".join(text.split())
    if len(clean) <= max_chars:
        return clean

    q_tokens = set(_tokenize(question))
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    best_sentence = max(
        sentences,
        key=lambda sentence: len(q_tokens.intersection(_tokenize(sentence))),
        default=clean[:max_chars],
    )

    if len(best_sentence) > max_chars:
        return best_sentence[: max_chars - 3].rstrip() + "..."

    start = max(0, clean.find(best_sentence) - 80)
    excerpt = clean[start : start + max_chars].strip()
    if start > 0:
        excerpt = "..." + excerpt
    if start + max_chars < len(clean):
        excerpt = excerpt.rstrip() + "..."
    return excerpt

def _embedding_request(text: str, task_type: str, title: str | None = None) -> dict[str, Any]:
    if DEFAULT_EMBEDDING_MODEL == "gemini-embedding-2":
        return {
            "model": _model_resource(DEFAULT_EMBEDDING_MODEL),
            "content": {"parts": [{"text": text}]},
        }

    config: dict[str, Any] = {
        "taskType": task_type,
        "autoTruncate": True,
        "outputDimensionality": EMBEDDING_DIMENSION,
    }
    if title and task_type == "RETRIEVAL_DOCUMENT":
        config["title"] = title[:512]

    return {
        "model": _model_resource(DEFAULT_EMBEDDING_MODEL),
        "content": {"parts": [{"text": text}]},
        "embedContentConfig": config,
    }

def _local_embedding(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSION
    tokens = _tokenize(text)
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSION
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if not norm:
        return vector
    return [value / norm for value in vector]

def _get_fastembed_client() -> Any:
    global FASTEMBED_CLIENT
    if FASTEMBED_CLIENT is None:
        from langchain_community.embeddings import FastEmbedEmbeddings
        FASTEMBED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        FASTEMBED_CLIENT = FastEmbedEmbeddings(
            model_name=DEFAULT_EMBEDDING_MODEL,
            cache_dir=str(FASTEMBED_CACHE_DIR),
        )
    return FASTEMBED_CLIENT

async def _embed_texts(
    *,
    texts: list[str],
    task_type: str,
    title: str | None = None,
) -> list[list[float]]:
    _ = task_type
    _ = title
    if not texts:
        return []

    if EMBEDDING_PROVIDER == "local":
        return [_local_embedding(text) for text in texts]
    try:
        vectors = _get_fastembed_client().embed_documents(texts)
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "FastEmbed embedding generation failed",
                "reason": str(error),
                "model": DEFAULT_EMBEDDING_MODEL,
            },
        ) from error
    return [list(map(float, vector)) for vector in vectors]

async def _embed_text(*, text: str, task_type: str) -> list[float]:
    vectors = await _embed_texts(texts=[text], task_type=task_type)
    return vectors[0]

class IngestRequest(BaseModel):
    workspace_id: str = Field(..., min_length=1)
    file_id: str = Field(..., min_length=1)
    file_name: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)
    gemini_api_key: str | None = None

class DeleteFileRequest(BaseModel):
    workspace_id: str = Field(..., min_length=1)
    file_id: str | None = None
    file_name: str | None = None
    file_id_or_name: str | None = None

class DeleteFilesRequest(BaseModel):
    workspace_id: str = Field(..., min_length=1)
    file_ids_or_names: list[str] = Field(default_factory=list)

class SourceRef(BaseModel):
    chunk_id: str
    file_id: str
    file_name: str
    score: float
    excerpt: str
    retrieval: dict[str, Any] = Field(default_factory=dict)

class QueryRequest(BaseModel):
    workspace_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=15, ge=1, le=50)
    context: str | None = None
    direct_context: bool = False
    file_id: str | None = None
    file_name: str | None = None
    model: str | None = None
    temperature: float = Field(default=0.2, ge=0, le=2)
    gemini_api_key: str | None = None
    cerebras_api_key: str | None = None

class RetrievalDiagnostics(BaseModel):
    mode: str
    dense_backend: str
    qdrant_enabled: bool
    collection: str | None
    embedding_model: str
    embedding_dimension: int
    dense_count: int
    lexical_count: int
    fused_count: int
    warnings: list[str] = Field(default_factory=list)

class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceRef]
    model: str
    retrieval: RetrievalDiagnostics

class SummaryRequest(BaseModel):
    text: str = Field(..., min_length=1)

def _sources_from_hits(hits: list[RetrievalHit], question: str) -> list[SourceRef]:
    max_fusion = max((hit.fusion_score for hit in hits), default=0.0)
    return [
        SourceRef(
            chunk_id=hit.chunk.id,
            file_id=hit.chunk.file_id,
            file_name=hit.chunk.file_name,
            score=round(hit.fusion_score / max_fusion, 4) if max_fusion > 0 else 0.0,
            excerpt=_excerpt(hit.chunk.text, question),
            retrieval={
                "fusion_score": round(hit.fusion_score, 6),
                "dense_score": round(hit.dense_score, 4),
                "lexical_score": round(hit.lexical_score, 4),
                "dense_rank": hit.dense_rank,
                "lexical_rank": hit.lexical_rank,
            },
        )
        for hit in hits
    ]

def _build_prompt(
    question: str,
    supplied_context: str | None,
    sources: list[SourceRef],
    hits: list[RetrievalHit] | None = None,
    evidence_focus: str = "head",
) -> str:
    if hits:
        source_context = "\n\n".join(
            (
                f"--- [File: {hit.chunk.file_name} | "
                f"chunk {_chunk_index(hit.chunk) + 1}/{_chunk_count(hit.chunk) or '?'}] ---\n"
                f"{hit.chunk.text}"
            )
            for hit in hits
        )
    else:
        source_context = "\n\n".join(
            f"[{source.file_name} | chunk {source.chunk_id} | score {source.score}] {source.excerpt}"
            for source in sources
        )
    source_context = _truncate_source_context(source_context, SOURCE_CONTEXT_CHARS, evidence_focus)
    supplied_context = _truncate_text(supplied_context or "", SUPPLIED_CONTEXT_CHARS)
    context_parts = [
        "Retrieved document evidence:\n" + source_context if source_context else "",
        "Workspace file metadata:\n" + supplied_context if supplied_context else "",
    ]
    context = "\n\n".join(part for part in context_parts if part).strip()

    if not context:
        context = "No workspace files or indexed chunks were available for this request."

    return f"""
You are Shuroq AI inside CHATB, a workspace data analysis app.
Answer the user's question using ONLY the retrieved document evidence below.

CRITICAL RULES:
1. Use ONLY the data provided below. Do NOT use outside knowledge.
2. For listing, counting, or filtering questions, scan ALL evidence chunks exhaustively.
   List EVERY matching entry from the data. Do NOT stop after finding a few matches.
3. Present only the final consolidated list or answer. Do not output your step-by-step chunk-by-chunk scanning log in the final response.
4. If the evidence is insufficient, say so clearly and suggest next steps.
5. Prefer exact values and names from the data. Be precise and complete.
6. When listing results, include ALL matches found across ALL chunks.
7. If the user asks multiple questions in a single prompt, you MUST address and answer ALL of them clearly and completely.
8. Evidence chunks are labeled in original document order. For first/last/final/beginning/end/before/after questions, answer from that document order, not from semantic relevance.
9. If asked for the last question, item, section, row, record, page, or line, identify the final matching entry that appears in the ordered evidence.

{context}

User question:
{question}
""".strip()

def _build_direct_document_prompt(question: str, supplied_context: str | None) -> str:
    selected_document_text = _truncate_text(supplied_context or "", DIRECT_CONTEXT_CHARS)
    if not selected_document_text:
        selected_document_text = "No selected document text was supplied for this request."

    return f"""Selected document text:
{selected_document_text}

CRITICAL RULES:
1. Answer only from the selected document text above.
2. If the selected document text does not contain the answer, say: {STRICT_PDF_REFUSAL}
3. If the user asks multiple questions in a single prompt, address all of them clearly and completely.

User question:
{question}""".strip()

async def _generate_with_gemini(
    *,
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
) -> str:
    url = GEMINI_API_URL.format(model=_model_path_name(model))
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=45, trust_env=False) as client:
            response = await client.post(f"{url}?key={api_key}", json=payload)
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Could not connect to Gemini API",
                "reason": str(error),
                "model": model,
            },
        ) from error

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Gemini API request failed",
                "status": response.status_code,
                "body": response.text[:1000],
                "model": model,
            },
        )

    data = response.json()
    candidates = data.get("candidates") or []
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    text = "\n".join(part.get("text", "") for part in parts).strip()

    if not text:
        raise HTTPException(
            status_code=502,
            detail={"message": "Gemini returned an empty response", "model": model},
        )

    return text

def _is_gemini_model(model: str) -> bool:
    return model.lower().startswith("gemini")

def _strip_reasoning_blocks(text: str) -> str:
    return re.sub(r"<think>.*?</think>\s*", "", text, flags=re.IGNORECASE | re.DOTALL).strip()

def _truncate_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."

async def _generate_with_cerebras(
    *,
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": STRICT_PDF_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": CEREBRAS_MAX_TOKENS,
    }

    try:
        async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
            response = await client.post(
                CEREBRAS_CHAT_COMPLETIONS_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Could not connect to Cerebras API",
                "reason": str(error),
                "model": model,
            },
        ) from error

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Cerebras API request failed",
                "status": response.status_code,
                "body": response.text[:1000],
                "model": model,
            },
        )

    data = response.json()
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            data = {"choices": [{"message": {"content": data}}]}
    if not isinstance(data, dict):
        data = {"choices": []}
    choices = data.get("choices") or []
    message = choices[0].get("message", {}) if choices else {}
    text = message.get("content", "") or ""
    text = _strip_reasoning_blocks(text)

    if not text:
        reasoning = message.get("reasoning", "") or ""
        reasoning = _strip_reasoning_blocks(str(reasoning))
        text = reasoning.strip()

    if not text:
        raise HTTPException(status_code=502, detail={"message": "Cerebras returned an empty response", "model": model})

    return text

async def _generate_response(
    *,
    gemini_api_key: str | None,
    cerebras_api_key: str | None,
    model: str,
    prompt: str,
    temperature: float,
) -> str:
    if _is_gemini_model(model):
        if not gemini_api_key:
            raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
        return await _generate_with_gemini(
            api_key=gemini_api_key,
            model=model,
            prompt=prompt,
            temperature=temperature,
        )

    api_key = cerebras_api_key or os.getenv("CEREBRAS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="CEREBRAS_API_KEY is not configured")

    try:
        return await _generate_with_cerebras(
            api_key=api_key,
            model=model,
            prompt=prompt,
            temperature=temperature,
        )
    except HTTPException as error:
        can_fallback_to_gemini = bool(gemini_api_key)
        if error.status_code < 500 or not can_fallback_to_gemini:
            raise

        return await _generate_with_gemini(
            api_key=gemini_api_key,
            model=DEFAULT_GEMINI_MODEL,
            prompt=prompt,
            temperature=temperature,
        )

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "chatb-ai-service",
        "model": DEFAULT_CHAT_MODEL,
        "retrieval": {
            "mode": "hybrid",
            "embedding_model": LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL,
            "embedding_provider": EMBEDDING_PROVIDER,
            "embedding_dimension": EMBEDDING_DIMENSION,
            "qdrant_enabled": bool(QDRANT_URL),
            "qdrant_collection_mode": QDRANT_COLLECTION_MODE,
            "chunk_chars": CHUNK_CHARS,
            "chunk_overlap_chars": CHUNK_OVERLAP_CHARS,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

def _log_vector_chunks_and_embeddings(
    *,
    req: IngestRequest,
    chunks: list[Chunk],
    vector_backend: str,
    warnings: list[str],
) -> None:
    label = "THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS"
    embedding_model = LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL

    print("\n" + "=" * 96, flush=True)
    print(label, flush=True)
    print(f"{label} | DOCUMENT SELECTED FOR CHAT", flush=True)
    print(f"{label} | workspace_id: {req.workspace_id}", flush=True)
    print(f"{label} | file_id: {req.file_id}", flush=True)
    print(f"{label} | file_name: {req.file_name}", flush=True)
    print(f"{label} | chunk_count: {len(chunks)}", flush=True)
    print(f"{label} | embedding_provider: {EMBEDDING_PROVIDER}", flush=True)
    print(f"{label} | embedding_model: {embedding_model}", flush=True)
    print(f"{label} | embedding_dimension: {EMBEDDING_DIMENSION}", flush=True)
    print(f"{label} | vector_backend: {vector_backend}", flush=True)
    if warnings:
        print(f"{label} | warnings: {json.dumps(warnings, ensure_ascii=False)}", flush=True)

    for index, chunk in enumerate(chunks, start=1):
        print("-" * 96, flush=True)
        print(f"{label} | VECTOR CHUNK {index}/{len(chunks)}", flush=True)
        print(f"{label} | chunk_id: {chunk.id}", flush=True)
        print(f"{label} | chunk_index: {chunk.metadata.get('chunk_index')}", flush=True)
        print(f"{label} | chunk_text_char_count: {len(chunk.text)}", flush=True)
        print(f"{label} | CHUNKED TEXT START", flush=True)
        try:
            print(chunk.text, flush=True)
        except UnicodeEncodeError:
            import sys
            enc = sys.stdout.encoding or "utf-8"
            print(chunk.text.encode(enc, errors="replace").decode(enc), flush=True)
        print(f"{label} | CHUNKED TEXT END", flush=True)
        print(f"{label} | EMBEDDING VECTOR START", flush=True)
        if chunk.embedding:
            preview = ", ".join(f"{val:.6f}" for val in chunk.embedding[:5])
            print(f"[{preview}, ... ({len(chunk.embedding)} dimensions)]", flush=True)
        else:
            print("[]", flush=True)
        print(f"{label} | EMBEDDING VECTOR END", flush=True)

    print(f"{label} | FINISHED LOGGING VECTOR CHUNKS AND EMBEDDINGS", flush=True)
    print("=" * 96 + "\n", flush=True)

@app.post("/ingest")
async def ingest(req: IngestRequest) -> dict[str, Any]:
    chunk_texts = _split_tabular_text(req.content) or _split_text(req.content)
    if not chunk_texts:
        print("\n" + "=" * 96, flush=True)
        print("THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | NO CHUNKS CREATED", flush=True)
        print(f"THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | file_id: {req.file_id}", flush=True)
        print(f"THIS IS FOR VECTOR CHUNKS AND EMBEDDINGS | file_name: {req.file_name}", flush=True)
        print("=" * 96 + "\n", flush=True)
        return {
            "ok": True,
            "workspace_id": req.workspace_id,
            "file_id": req.file_id,
            "file_name": req.file_name,
            "chunk_count": 0,
            "chunk_ids": [],
            "vector_backend": "none",
        }

    embeddings = await _embed_texts(
        texts=chunk_texts,
        task_type="RETRIEVAL_DOCUMENT",
        title=req.file_name,
    )

    _delete_local_file_identifiers(req.workspace_id, [req.file_id, req.file_name])

    created: list[str] = []
    chunks: list[Chunk] = []
    now = datetime.now(timezone.utc).isoformat()
    for idx, (chunk_text, embedding) in enumerate(zip(chunk_texts, embeddings)):
        chunk_id = str(uuid4())
        chunk = Chunk(
            id=chunk_id,
            workspace_id=req.workspace_id,
            file_id=req.file_id,
            file_name=req.file_name,
            text=chunk_text,
            metadata={
                **req.metadata,
                "chunk_index": idx,
                "chunk_count": len(chunk_texts),
            },
            created_at=now,
            embedding=embedding,
        )
        VECTOR_STORE[req.workspace_id].append(chunk)
        chunks.append(chunk)
        created.append(chunk_id)

    save_store()

    warnings: list[str] = []
    vector_backend = "local"
    if QDRANT_URL:
        try:
            await _qdrant_delete_file_identifiers(req.workspace_id, [req.file_id, req.file_name])
            await _qdrant_upsert_chunks(req.workspace_id, chunks)
            vector_backend = "qdrant+local"
        except QdrantError as error:
            warnings.append(f"Qdrant upsert failed; local vector store was updated: {error}")

    _log_vector_chunks_and_embeddings(
        req=req,
        chunks=chunks,
        vector_backend=vector_backend,
        warnings=warnings,
    )

    return {
        "ok": True,
        "workspace_id": req.workspace_id,
        "file_id": req.file_id,
        "file_name": req.file_name,
        "chunk_count": len(created),
        "chunk_ids": created,
        "embedding_model": LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL,
        "embedding_provider": EMBEDDING_PROVIDER,
        "embedding_dimension": EMBEDDING_DIMENSION,
        "vector_backend": vector_backend,
        "warnings": warnings,
    }

@app.post("/delete-file")
async def delete_file(req: DeleteFileRequest) -> dict[str, Any]:
    identifiers = [
        value
        for value in [req.file_id, req.file_name, req.file_id_or_name]
        if value and value.strip()
    ]
    removed_local = _delete_local_file_identifiers(req.workspace_id, identifiers)
    warnings: list[str] = []

    if QDRANT_URL and identifiers:
        try:
            await _qdrant_delete_file_identifiers(req.workspace_id, identifiers)
        except QdrantError as error:
            warnings.append(f"Qdrant delete failed: {error}")

    return {
        "ok": True,
        "workspace_id": req.workspace_id,
        "deleted_local_chunks": removed_local,
        "warnings": warnings,
    }

@app.post("/delete-files")
async def delete_files(req: DeleteFilesRequest) -> dict[str, Any]:
    identifiers = [value for value in req.file_ids_or_names if value and value.strip()]
    removed_local = _delete_local_file_identifiers(req.workspace_id, identifiers)
    warnings: list[str] = []

    if QDRANT_URL and identifiers:
        try:
            await _qdrant_delete_file_identifiers(req.workspace_id, identifiers)
        except QdrantError as error:
            warnings.append(f"Qdrant batch delete failed: {error}")

    return {
        "ok": True,
        "workspace_id": req.workspace_id,
        "deleted_local_chunks": removed_local,
        "warnings": warnings,
    }

@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest) -> QueryResponse:
    embedding_api_key = req.gemini_api_key or os.getenv("GEMINI_API_KEY")
    model = req.model or DEFAULT_CHAT_MODEL

    effective_top_k = req.top_k
    file_chunks = _local_workspace_chunks(req.workspace_id, req.file_id, req.file_name)
    order_sensitive = _is_order_sensitive_query(req.question)
    evidence_focus = _order_focus(req.question) if order_sensitive else "head"

    is_tabular = False
    if req.file_name:
        is_tabular = req.file_name.lower().endswith((".csv", ".tsv", ".xlsx", ".xls"))

    if _is_aggregate_query(req.question) or is_tabular or order_sensitive:
        effective_top_k = max(req.top_k, len(file_chunks), 30)

    candidate_limit = max(effective_top_k * DENSE_CANDIDATE_MULTIPLIER, effective_top_k)
    lexical_limit = max(effective_top_k * LEXICAL_CANDIDATE_MULTIPLIER, effective_top_k)
    warnings: list[str] = []
    dense_backend = "local"
    collection = _collection_name(req.workspace_id) if QDRANT_URL else None

    if req.direct_context:
        warnings: list[str] = []
        if not (req.context or "").strip():
            warnings.append("Direct selected-document context was requested, but no document text was supplied.")

        prompt = _build_direct_document_prompt(req.question, req.context)
        answer = await _generate_response(
            gemini_api_key=embedding_api_key,
            cerebras_api_key=req.cerebras_api_key,
            model=model,
            prompt=prompt,
            temperature=req.temperature,
        )

        lower = answer.lower()
        if any(token in lower for token in ("analyze the request", "constraint", "selected document text:", "user question:")):
            answer = STRICT_PDF_REFUSAL

        diagnostics = RetrievalDiagnostics(
            mode="direct_selected_document_context",
            dense_backend="not_used",
            qdrant_enabled=bool(QDRANT_URL),
            collection=collection,
            embedding_model=LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL,
            embedding_dimension=EMBEDDING_DIMENSION,
            dense_count=0,
            lexical_count=0,
            fused_count=0,
            warnings=warnings,
        )
        return QueryResponse(answer=answer, sources=[], model=model, retrieval=diagnostics)

    if order_sensitive:
        ordered_chunks = _ordered_chunks(
            await _workspace_chunks_for_lexical(req.workspace_id, req.file_id, req.file_name)
        )
        hits = _ordered_hits(ordered_chunks)
        sources = _sources_from_hits(hits, req.question)

        deterministic_answer = _answer_question_boundaries(req.question, ordered_chunks)
        if deterministic_answer:
            diagnostics = RetrievalDiagnostics(
                mode="deterministic_ordered_question_scan",
                dense_backend="not_used",
                qdrant_enabled=bool(QDRANT_URL),
                collection=collection,
                embedding_model=LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL,
                embedding_dimension=EMBEDDING_DIMENSION,
                dense_count=0,
                lexical_count=len(ordered_chunks),
                fused_count=len(hits),
                warnings=warnings,
            )
            return QueryResponse(answer=deterministic_answer, sources=sources, model=model, retrieval=diagnostics)

        prompt = _build_prompt(req.question, req.context, sources, hits=hits, evidence_focus=evidence_focus)
        answer = await _generate_response(
            gemini_api_key=embedding_api_key,
            cerebras_api_key=req.cerebras_api_key,
            model=model,
            prompt=prompt,
            temperature=req.temperature,
        )

        diagnostics = RetrievalDiagnostics(
            mode="ordered_document_scan",
            dense_backend="not_used",
            qdrant_enabled=bool(QDRANT_URL),
            collection=collection,
            embedding_model=LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL,
            embedding_dimension=EMBEDDING_DIMENSION,
            dense_count=0,
            lexical_count=len(ordered_chunks),
            fused_count=len(hits),
            warnings=warnings,
        )
        return QueryResponse(answer=answer, sources=sources, model=model, retrieval=diagnostics)

    dense_results: list[tuple[float, Chunk]] = []
    try:
        query_embedding = await _embed_text(
            text=req.question,
            task_type="RETRIEVAL_QUERY",
        )

        if QDRANT_URL:
            try:
                dense_results = await _qdrant_dense_search(
                    req.workspace_id,
                    query_embedding,
                    candidate_limit,
                    req.file_id,
                    req.file_name,
                )
                dense_backend = "qdrant"
            except QdrantError as error:
                warnings.append(f"Qdrant dense search failed; used local dense search: {error}")

        if not dense_results:
            dense_results = _dense_search_local(
                req.workspace_id,
                query_embedding,
                candidate_limit,
                req.file_id,
                req.file_name,
            )
            dense_backend = "local"
    except HTTPException as error:
        warnings.append(f"Embedding search skipped: {error.detail}")

    lexical_chunks = await _workspace_chunks_for_lexical(req.workspace_id, req.file_id, req.file_name)
    lexical_results = _lexical_search(req.question, lexical_chunks, lexical_limit)
    hits = _fuse_results(dense_results, lexical_results, effective_top_k)
    sources = _sources_from_hits(hits, req.question)

    prompt = _build_prompt(req.question, req.context, sources, hits=hits, evidence_focus=evidence_focus)
    answer = await _generate_response(
        gemini_api_key=embedding_api_key,
        cerebras_api_key=req.cerebras_api_key,
        model=model,
        prompt=prompt,
        temperature=req.temperature,
    )

    diagnostics = RetrievalDiagnostics(
        mode="hybrid_dense_bm25_rrf",
        dense_backend=dense_backend,
        qdrant_enabled=bool(QDRANT_URL),
        collection=collection,
        embedding_model=LOCAL_EMBEDDING_MODEL if EMBEDDING_PROVIDER == "local" else DEFAULT_EMBEDDING_MODEL,
        embedding_dimension=EMBEDDING_DIMENSION,
        dense_count=len(dense_results),
        lexical_count=len(lexical_results),
        fused_count=len(hits),
        warnings=warnings,
    )
    return QueryResponse(answer=answer, sources=sources, model=model, retrieval=diagnostics)

@app.post("/summary")
async def summarize(req: SummaryRequest) -> dict[str, Any]:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    cerebras_api_key = os.getenv("CEREBRAS_API_KEY")
    if not gemini_api_key and not cerebras_api_key:
        cleaned = " ".join(req.text.split())
        summary = cleaned[:500]
        if len(cleaned) > 500:
            summary += "..."
        return {"ok": True, "summary": summary}

    prompt = f"Summarize this text in 5 concise bullet points:\n\n{req.text}"
    summary = await _generate_response(
        gemini_api_key=gemini_api_key,
        cerebras_api_key=cerebras_api_key,
        model=DEFAULT_CHAT_MODEL,
        prompt=prompt,
        temperature=0.2,
    )
    return {"ok": True, "summary": summary}
