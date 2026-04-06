from dataclasses import dataclass
from functools import lru_cache
import os


@dataclass(frozen=True)
class Settings:
  app_name: str
  app_version: str
  backend_base_url: str
  host: str
  port: int
  request_timeout: float


@lru_cache
def get_settings() -> Settings:
  return Settings(
    app_name=os.getenv('MCP_APP_NAME', 'Lumos MCP Server'),
    app_version=os.getenv('MCP_APP_VERSION', '0.1.0'),
    backend_base_url=os.getenv('BACKEND_BASE_URL', 'http://backend:3000'),
    host=os.getenv('MCP_HOST', '0.0.0.0'),
    port=int(os.getenv('MCP_PORT', '8000')),
    request_timeout=float(os.getenv('MCP_REQUEST_TIMEOUT', '30')),
  )
