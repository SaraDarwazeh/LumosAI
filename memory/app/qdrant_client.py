from datetime import datetime, timezone
import os
import re
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.embedding import EmbeddingService


MIN_SCORE = 0.25
KEYWORD_MIN_LENGTH = 2


class MemoryQdrantClient:
  def __init__(self, embedding_service: EmbeddingService):
    self.collection_name = os.getenv('QDRANT_COLLECTION_NAME', 'lumos_memory')
    self._client = QdrantClient(url=os.getenv('QDRANT_URL', 'http://qdrant:6333'))
    self._embedding_service = embedding_service

  def ensure_collection(self) -> None:
    existing_collections = self._client.get_collections().collections
    collection_names = {collection.name for collection in existing_collections}

    if self.collection_name in collection_names:
      return

    self._client.create_collection(
      collection_name=self.collection_name,
      vectors_config=models.VectorParams(
        size=self._embedding_service.dimension,
        distance=models.Distance.COSINE,
      ),
    )

  def upsert_memory(
    self,
    *,
    memory_id: str,
    text: str,
    memory_type: str,
    metadata: dict[str, Any] | None = None,
  ) -> dict[str, Any]:
    user_id = metadata.get('user_id') if metadata else None
    payload = {
      'text': text,
      'type': memory_type,
      'user_id': user_id,
      'original_id': memory_id,
      'timestamp': datetime.now(timezone.utc).isoformat(),
      'metadata': metadata or {},
    }

    self._client.upsert(
      collection_name=self.collection_name,
      points=[
        models.PointStruct(
          id=memory_id,
          vector=self._embedding_service.embed(text),
          payload=payload,
        ),
      ],
    )

    return {
      'id': memory_id,
      **payload,
    }

  def search_memory(
    self,
    *,
    query: str,
    top_k: int,
    user_id: str | None = None,
  ) -> list[dict[str, Any]]:
    query_vector = self._embedding_service.embed(query)
    search_results = self._client.search(
      collection_name=self.collection_name,
      query_vector=query_vector,
      limit=max(top_k * 3, top_k),
      query_filter=self._build_user_filter(user_id),
      with_payload=True,
    )

    deduped_results: dict[str, dict[str, Any]] = {}

    for result in search_results:
      if result.score < MIN_SCORE:
        continue

      payload = result.payload or {}
      text = str(payload.get('text') or '')

      reranked_score = self._cosine_similarity(
        query_vector,
        self._embedding_service.embed(text),
      )
      result_id = str(result.id)
      formatted_result = {
        'id': result_id,
        'score': reranked_score,
        'text': text,
        'type': payload.get('type'),
        'original_id': payload.get('original_id'),
        'timestamp': payload.get('timestamp'),
        'metadata': payload.get('metadata', {}),
      }

      existing_result = deduped_results.get(result_id)
      if existing_result is None or reranked_score > existing_result['score']:
        deduped_results[result_id] = formatted_result

    results = sorted(
      deduped_results.values(),
      key=lambda item: (-item['score'], item['id']),
    )

    return results[:top_k]

  def delete_memory(self, memory_id: str) -> dict[str, str]:
    self._client.delete(
      collection_name=self.collection_name,
      points_selector=models.PointIdsList(points=[memory_id]),
    )

    return {
      'id': memory_id,
      'status': 'deleted',
    }

  def _build_user_filter(self, user_id: str | None) -> models.Filter | None:
    if user_id is None:
      return None

    return models.Filter(
      must=[
        models.FieldCondition(
          key='user_id',
          match=models.MatchValue(value=user_id),
        ),
      ],
    )

  def _extract_keywords(self, query: str) -> set[str]:
    raw_tokens = re.findall(r'\b\w+\b', query.lower())
    normalized_tokens = {
      self._normalize_token(token)
      for token in raw_tokens
      if len(token) >= KEYWORD_MIN_LENGTH
    }
    normalized_tokens.discard('')
    return normalized_tokens

  def _text_matches_keywords(self, text: str, keywords: set[str]) -> bool:
    text_tokens = {
      self._normalize_token(token)
      for token in re.findall(r'\b\w+\b', text.lower())
    }
    text_tokens.discard('')
    return bool(text_tokens & keywords)

  def _normalize_token(self, token: str) -> str:
    normalized = token.strip().lower()

    for suffix in ('ing', 'ed', 'es', 's'):
      if normalized.endswith(suffix) and len(normalized) > len(suffix) + 2:
        normalized = normalized[: -len(suffix)]
        break

    return normalized

  def _cosine_similarity(
    self,
    left_vector: list[float],
    right_vector: list[float],
  ) -> float:
    return float(sum(left * right for left, right in zip(left_vector, right_vector)))
