from typing import Any

import httpx


class BackendClientError(Exception):
  def __init__(self, status_code: int, message: str, details: Any | None = None):
    super().__init__(message)
    self.status_code = status_code
    self.message = message
    self.details = details


class BackendClient:
  def __init__(self, base_url: str, timeout: float = 30.0):
    self._client = httpx.AsyncClient(
      base_url=base_url.rstrip('/'),
      timeout=timeout,
      headers={'Accept': 'application/json'},
    )

  async def close(self) -> None:
    await self._client.aclose()

  async def get(
    self,
    path: str,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
  ) -> Any:
    return await self._request('GET', path, params=params, headers=headers)

  async def post(
    self,
    path: str,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
  ) -> Any:
    return await self._request('POST', path, json_body=json_body, headers=headers)

  async def patch(
    self,
    path: str,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
  ) -> Any:
    return await self._request('PATCH', path, json_body=json_body, headers=headers)

  async def delete(self, path: str, headers: dict[str, str] | None = None) -> Any:
    return await self._request('DELETE', path, headers=headers)

  async def _request(
    self,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
  ) -> Any:
    try:
      response = await self._client.request(
        method,
        self._normalize_path(path),
        params=params,
        json=json_body,
        headers=headers,
      )
    except httpx.RequestError as exc:
      raise BackendClientError(
        status_code=503,
        message='Unable to reach the backend service.',
        details={'reason': str(exc)},
      ) from exc

    payload = self._safe_json(response)

    if response.is_error:
      error_details = self._extract_error_details(payload, response)
      raise BackendClientError(
        status_code=response.status_code,
        message=error_details['message'],
        details=error_details,
      )

    if not isinstance(payload, dict) or payload.get('success') is not True or 'data' not in payload:
      raise BackendClientError(
        status_code=502,
        message='Backend returned an unexpected response format.',
        details={'response_body': payload},
      )

    return payload['data']

  @staticmethod
  def _normalize_path(path: str) -> str:
    return path if path.startswith('/') else f'/{path}'

  @staticmethod
  def _safe_json(response: httpx.Response) -> Any:
    try:
      return response.json()
    except ValueError:
      return None

  @staticmethod
  def _extract_error_details(payload: Any, response: httpx.Response) -> dict[str, Any]:
    if isinstance(payload, dict):
      message = payload.get('message', response.reason_phrase)
      if isinstance(message, list):
        joined_message = '; '.join(str(item) for item in message)
      else:
        joined_message = str(message)

      return {
        'message': joined_message or 'Backend request failed.',
        'status_code': response.status_code,
        'body': payload,
      }

    return {
      'message': response.text or response.reason_phrase or 'Backend request failed.',
      'status_code': response.status_code,
    }
