from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import UUID4, BaseModel, ConfigDict, Field

from app.qdrant_client import MemoryQdrantClient


router = APIRouter(prefix='/memory', tags=['memory'])


class StrictSchema(BaseModel):
  model_config = ConfigDict(extra='forbid')


class IndexMemoryRequest(StrictSchema):
  id: UUID4
  text: str = Field(min_length=1)
  type: Literal['note', 'idea', 'message', 'signal']
  metadata: dict[str, Any] = Field(default_factory=dict)


class SearchMemoryRequest(StrictSchema):
  query: str = Field(min_length=1)
  top_k: int = Field(default=5, ge=1, le=50)
  user_id: UUID4 | None = None


@router.post('/index')
def index_memory(payload: IndexMemoryRequest, request: Request):
  qdrant_client: MemoryQdrantClient = request.app.state.qdrant_client
  return qdrant_client.upsert_memory(
    memory_id=str(payload.id),
    text=payload.text,
    memory_type=payload.type,
    metadata=payload.metadata,
  )


@router.post('/search')
def search_memory(payload: SearchMemoryRequest, request: Request):
  qdrant_client: MemoryQdrantClient = request.app.state.qdrant_client
  return {
    'query': payload.query,
    'results': qdrant_client.search_memory(
      query=payload.query,
      top_k=payload.top_k,
      user_id=str(payload.user_id) if payload.user_id is not None else None,
    ),
  }


@router.delete('/{memory_id}')
def delete_memory(memory_id: UUID4, request: Request):
  qdrant_client: MemoryQdrantClient = request.app.state.qdrant_client
  return qdrant_client.delete_memory(str(memory_id))
