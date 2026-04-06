from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.embedding import EmbeddingService
from app.qdrant_client import MemoryQdrantClient
from app.routes.memory import router as memory_router


@asynccontextmanager
async def lifespan(app: FastAPI):
  embedding_service = EmbeddingService()
  qdrant_client = MemoryQdrantClient(embedding_service)
  qdrant_client.ensure_collection()

  app.state.embedding_service = embedding_service
  app.state.qdrant_client = qdrant_client

  yield


app = FastAPI(
  title='Lumos Memory Service',
  version='0.1.0',
  lifespan=lifespan,
)


@app.get('/health')
def healthcheck():
  return {'status': 'ok'}


app.include_router(memory_router)
