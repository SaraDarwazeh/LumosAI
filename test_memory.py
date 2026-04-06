from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4
import sys
import time

import httpx


BACKEND_BASE_URL = 'http://localhost:3000'
MEMORY_BASE_URL = 'http://localhost:8010'
REQUEST_TIMEOUT = 30.0
HEALTH_RETRY_DELAY_SECONDS = 1.0
BACKEND_HEALTH_RETRY_COUNT = 20
MEMORY_HEALTH_RETRY_COUNT = 120
RELEVANCE_THRESHOLD = 0.4


class Colors:
  RESET = '\033[0m'
  GREEN = '\033[32m'
  RED = '\033[31m'
  CYAN = '\033[36m'


class TestFailure(Exception):
  pass


@dataclass
class TestContext:
  note_ids: list[str]
  idea_ids: list[str]


def log_info(message: str) -> None:
  print(f'{Colors.CYAN}[INFO]{Colors.RESET} {message}')


def log_pass(message: str) -> None:
  print(f'{Colors.GREEN}[PASS]{Colors.RESET} {message}')


def log_fail(message: str) -> None:
  print(f'{Colors.RED}[FAIL]{Colors.RESET} {message}')


def assert_condition(condition: bool, message: str) -> None:
  if not condition:
    raise TestFailure(message)


def perform_request(
  client: httpx.Client,
  method: str,
  url: str,
  *,
  expected_status: int | None,
  json_body: dict[str, Any] | None = None,
) -> tuple[int, Any, float]:
  started_at = time.perf_counter()
  response = client.request(method, url, json=json_body)
  duration_ms = (time.perf_counter() - started_at) * 1000

  try:
    payload = response.json()
  except ValueError:
    payload = response.text

  if expected_status is not None and response.status_code != expected_status:
    raise TestFailure(
      f'Expected HTTP {expected_status}, got HTTP {response.status_code}. '
      f'Response: {payload}'
    )

  return response.status_code, payload, duration_ms


def backend_request(
  client: httpx.Client,
  method: str,
  path: str,
  *,
  expected_status: int = 200,
  json_body: dict[str, Any] | None = None,
) -> tuple[Any, float]:
  _, payload, duration_ms = perform_request(
    client,
    method,
    f'{BACKEND_BASE_URL}{path}',
    expected_status=expected_status,
    json_body=json_body,
  )

  assert_condition(isinstance(payload, dict), 'Backend response must be a JSON object.')
  assert_condition(payload.get('success') is True, 'Backend success flag must be true.')
  assert_condition('data' in payload, 'Backend response must include data.')

  return payload['data'], duration_ms


def memory_request(
  client: httpx.Client,
  method: str,
  path: str,
  *,
  expected_status: int = 200,
  json_body: dict[str, Any] | None = None,
) -> tuple[Any, float]:
  _, payload, duration_ms = perform_request(
    client,
    method,
    f'{MEMORY_BASE_URL}{path}',
    expected_status=expected_status,
    json_body=json_body,
  )
  return payload, duration_ms


def wait_for_service_health(
  client: httpx.Client,
  *,
  base_url: str,
  name: str,
  path: str,
  retry_count: int,
  success_validator,
) -> None:
  last_error: Exception | None = None

  for attempt in range(1, retry_count + 1):
    try:
      _, payload, duration_ms = perform_request(
        client,
        'GET',
        f'{base_url}{path}',
        expected_status=200,
      )
      success_validator(payload)
      log_pass(f'{name} health ({duration_ms:.1f} ms)')
      return
    except Exception as exc:  # noqa: BLE001
      last_error = exc
      if attempt < retry_count:
        log_info(f'Waiting for {name} ({attempt}/{retry_count})...')
        time.sleep(HEALTH_RETRY_DELAY_SECONDS)

  raise TestFailure(f'{name} did not become healthy: {last_error}')


def create_note(client: httpx.Client, content: str) -> dict[str, Any]:
  note, duration_ms = backend_request(
    client,
    'POST',
    '/notes',
    expected_status=201,
    json_body={
      'content': content,
      'attached_to_type': 'none',
    },
  )
  log_pass(f'create_note ({duration_ms:.1f} ms)')
  return note


def update_note(client: httpx.Client, note_id: str, content: str) -> dict[str, Any]:
  note, duration_ms = backend_request(
    client,
    'PATCH',
    f'/notes/{note_id}',
    json_body={
      'content': content,
    },
  )
  log_pass(f'update_note ({duration_ms:.1f} ms)')
  return note


def delete_note(client: httpx.Client, note_id: str) -> None:
  _, duration_ms = backend_request(
    client,
    'DELETE',
    f'/notes/{note_id}',
  )
  log_pass(f'delete_note ({duration_ms:.1f} ms)')


def create_idea(client: httpx.Client, title: str, description: str) -> dict[str, Any]:
  idea, duration_ms = backend_request(
    client,
    'POST',
    '/ideas',
    expected_status=201,
    json_body={
      'title': title,
      'description': description,
      'status': 'idea',
    },
  )
  log_pass(f'create_idea ({duration_ms:.1f} ms)')
  return idea


def delete_idea(client: httpx.Client, idea_id: str) -> None:
  _, duration_ms = backend_request(
    client,
    'DELETE',
    f'/ideas/{idea_id}',
  )
  log_pass(f'delete_idea ({duration_ms:.1f} ms)')


def search_memory(client: httpx.Client, query: str, *, top_k: int = 5) -> list[dict[str, Any]]:
  payload, duration_ms = memory_request(
    client,
    'POST',
    '/memory/search',
    json_body={
      'query': query,
      'top_k': top_k,
    },
  )
  assert_condition(isinstance(payload, dict), 'Memory search response must be an object.')
  assert_condition('results' in payload, 'Memory search response must include results.')
  assert_condition(isinstance(payload['results'], list), 'Memory search results must be a list.')
  log_pass(f'search_memory "{query}" ({duration_ms:.1f} ms)')
  return payload['results']


def index_memory(
  client: httpx.Client,
  *,
  item_id: str,
  text: str,
  item_type: str,
  metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
  payload, duration_ms = memory_request(
    client,
    'POST',
    '/memory/index',
    json_body={
      'id': item_id,
      'text': text,
      'type': item_type,
      'metadata': metadata or {},
    },
  )
  assert_condition(isinstance(payload, dict), 'Memory index response must be an object.')
  assert_condition(payload.get('id') == item_id, 'Indexed memory id mismatch.')
  log_pass(f'index_memory ({duration_ms:.1f} ms)')
  return payload


def delete_memory(client: httpx.Client, memory_id: str, *, expected_status: int = 200) -> Any:
  payload, duration_ms = memory_request(
    client,
    'DELETE',
    f'/memory/{memory_id}',
    expected_status=expected_status,
  )
  if expected_status == 200:
    assert_condition(isinstance(payload, dict), 'Memory delete response must be an object.')
    assert_condition(payload.get('id') == memory_id, 'Deleted memory id mismatch.')
    log_pass(f'delete_memory ({duration_ms:.1f} ms)')
  else:
    log_pass(f'delete_memory invalid id ({duration_ms:.1f} ms)')
  return payload


def find_result(results: list[dict[str, Any]], item_id: str) -> dict[str, Any] | None:
  for result in results:
    if result.get('id') == item_id or result.get('original_id') == item_id:
      return result
  return None


def assert_result_matches(
  results: list[dict[str, Any]],
  item_id: str,
  *,
  expected_text_substring: str,
  min_score: float = RELEVANCE_THRESHOLD,
) -> dict[str, Any]:
  result = find_result(results, item_id)
  assert_condition(result is not None, f'Expected memory item "{item_id}" was not returned.')
  assert_condition(
    expected_text_substring.lower() in str(result.get('text', '')).lower(),
    f'Expected text fragment "{expected_text_substring}" not found in memory result.',
  )
  score = result.get('score')
  assert_condition(isinstance(score, (int, float)), 'Memory result score must be numeric.')
  assert_condition(score >= min_score, f'Memory similarity score too low: {score}')
  return result


def wait_for_memory_result(
  client: httpx.Client,
  *,
  query: str,
  item_id: str,
  expected_text_substring: str,
  timeout_seconds: float = 20.0,
  top_k: int = 5,
) -> dict[str, Any]:
  deadline = time.time() + timeout_seconds
  last_results: list[dict[str, Any]] = []

  while time.time() < deadline:
    results = search_memory(client, query, top_k=top_k)
    last_results = results
    match = find_result(results, item_id)
    if match and expected_text_substring.lower() in str(match.get('text', '')).lower():
      return assert_result_matches(
        results,
        item_id,
        expected_text_substring=expected_text_substring,
      )
    time.sleep(0.5)

  raise TestFailure(
    f'Item "{item_id}" was not indexed for query "{query}". Last results: {last_results}'
  )


def wait_for_memory_absence(
  client: httpx.Client,
  *,
  query: str,
  item_id: str,
  timeout_seconds: float = 20.0,
  top_k: int = 5,
) -> None:
  deadline = time.time() + timeout_seconds
  last_results: list[dict[str, Any]] = []

  while time.time() < deadline:
    results = search_memory(client, query, top_k=top_k)
    last_results = results
    match = find_result(results, item_id)
    if match is None:
      return

    score = match.get('score')
    if not isinstance(score, (int, float)):
      raise TestFailure(f'Memory result score must be numeric. Result: {match}')

    if score < RELEVANCE_THRESHOLD:
      log_info(
        f'item ignored (low relevance): {item_id} score={score:.3f} query="{query}"',
      )
      return

    time.sleep(0.5)

  raise TestFailure(
    f'Item "{item_id}" still appears for query "{query}". Last results: {last_results}'
  )


def test_note_indexing_and_semantics(client: httpx.Client, context: TestContext) -> str:
  note = create_note(client, 'I want to build an AI startup')
  note_id = note['id']
  context.note_ids.append(note_id)

  wait_for_memory_result(
    client,
    query='AI startup',
    item_id=note_id,
    expected_text_substring='AI startup',
  )
  log_pass('indexing')

  wait_for_memory_result(
    client,
    query='building something with artificial intelligence',
    item_id=note_id,
    expected_text_substring='AI startup',
  )
  log_pass('semantic search')

  return note_id


def test_note_update_flow(client: httpx.Client, note_id: str) -> None:
  updated_note = update_note(client, note_id, 'I want to build a fitness mobile app')
  assert_condition(updated_note.get('content') == 'I want to build a fitness mobile app', 'Note update did not persist.')

  wait_for_memory_result(
    client,
    query='fitness app',
    item_id=note_id,
    expected_text_substring='fitness mobile app',
  )

  wait_for_memory_absence(
    client,
    query='AI startup',
    item_id=note_id,
  )
  log_pass('update')


def test_note_delete_flow(client: httpx.Client, context: TestContext, note_id: str) -> None:
  delete_note(client, note_id)
  context.note_ids = [existing_id for existing_id in context.note_ids if existing_id != note_id]
  wait_for_memory_absence(
    client,
    query='fitness app',
    item_id=note_id,
  )
  log_pass('deletion confirmed')
  log_pass('delete')


def test_idea_flow(client: httpx.Client, context: TestContext) -> None:
  idea = create_idea(client, 'Startup idea', 'AI productivity assistant')
  idea_id = idea['id']
  context.idea_ids.append(idea_id)

  wait_for_memory_result(
    client,
    query='productivity assistant',
    item_id=idea_id,
    expected_text_substring='AI productivity assistant',
  )
  log_pass('idea flow')


def test_edge_cases(client: httpx.Client) -> None:
  payload, duration_ms = memory_request(
    client,
    'POST',
    '/memory/search',
    expected_status=422,
    json_body={
      'query': '',
      'top_k': 5,
    },
  )
  assert_condition(isinstance(payload, dict), 'Empty query error response must be an object.')
  log_pass(f'empty query ({duration_ms:.1f} ms)')

  payload, duration_ms = memory_request(
    client,
    'DELETE',
    '/memory/not-a-uuid',
    expected_status=422,
  )
  assert_condition(isinstance(payload, dict), 'Invalid delete id error response must be an object.')
  log_pass(f'invalid ID deletion ({duration_ms:.1f} ms)')

  repeated_id = str(uuid4())
  first_index = index_memory(
    client,
    item_id=repeated_id,
    text='Repeated indexing should overwrite safely',
    item_type='note',
    metadata={'source': 'test'},
  )
  second_index = index_memory(
    client,
    item_id=repeated_id,
    text='Repeated indexing should overwrite safely',
    item_type='note',
    metadata={'source': 'test'},
  )
  assert_condition(first_index['id'] == second_index['id'] == repeated_id, 'Repeated indexing should preserve the same id.')

  wait_for_memory_result(
    client,
    query='overwrite safely',
    item_id=repeated_id,
    expected_text_substring='overwrite safely',
  )
  delete_memory(client, repeated_id)
  wait_for_memory_absence(
    client,
    query='overwrite safely',
    item_id=repeated_id,
  )
  log_pass('repeated indexing')


def cleanup(client: httpx.Client, context: TestContext) -> None:
  for note_id in list(context.note_ids):
    try:
      backend_request(client, 'DELETE', f'/notes/{note_id}')
    except Exception:
      pass

  for idea_id in list(context.idea_ids):
    try:
      backend_request(client, 'DELETE', f'/ideas/{idea_id}')
    except Exception:
      pass


def main() -> int:
  context = TestContext(note_ids=[], idea_ids=[])

  with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
    wait_for_service_health(
      client,
      base_url=BACKEND_BASE_URL,
      name='backend',
      path='/tasks',
      retry_count=BACKEND_HEALTH_RETRY_COUNT,
      success_validator=lambda payload: (
        assert_condition(isinstance(payload, dict), 'Backend readiness response must be an object.'),
        assert_condition(payload.get('success') is True, 'Backend readiness response must set success=true.'),
        assert_condition(isinstance(payload.get('data'), list), 'Backend readiness data must be a list.'),
      ),
    )
    wait_for_service_health(
      client,
      base_url=MEMORY_BASE_URL,
      name='memory-service',
      path='/health',
      retry_count=MEMORY_HEALTH_RETRY_COUNT,
      success_validator=lambda payload: (
        assert_condition(isinstance(payload, dict), 'Memory health response must be an object.'),
        assert_condition(payload.get('status') == 'ok', 'Memory health status must be "ok".'),
      ),
    )

    try:
      note_id = test_note_indexing_and_semantics(client, context)
      test_note_update_flow(client, note_id)
      test_note_delete_flow(client, context, note_id)
      test_idea_flow(client, context)
      test_edge_cases(client)
    except Exception as exc:  # noqa: BLE001
      cleanup(client, context)
      log_fail(str(exc))
      return 1

    cleanup(client, context)

  log_pass('All memory end-to-end checks passed.')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
