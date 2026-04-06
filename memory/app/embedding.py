from functools import lru_cache
import os

from sentence_transformers import SentenceTransformer


@lru_cache
def _load_model(model_name: str) -> SentenceTransformer:
  return SentenceTransformer(model_name)


class EmbeddingService:
  def __init__(self, model_name: str | None = None):
    self.model_name = model_name or os.getenv(
      'EMBEDDING_MODEL_NAME',
      'sentence-transformers/all-MiniLM-L6-v2',
    )
    self._model = _load_model(self.model_name)

  @property
  def dimension(self) -> int:
    dimension = self._model.get_sentence_embedding_dimension()
    if dimension is None:
      raise RuntimeError('Embedding model did not expose an embedding dimension.')
    return dimension

  def embed(self, text: str) -> list[float]:
    return self._model.encode(text, normalize_embeddings=True).tolist()
