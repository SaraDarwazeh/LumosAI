from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sys
import time
from typing import Any, Iterable

import httpx


MCP_BASE_URL = 'http://localhost:8000'
REQUEST_TIMEOUT = 30.0
HEALTH_RETRY_COUNT = 10
HEALTH_RETRY_DELAY_SECONDS = 1.0
EXPECTED_TOOLS = {
  'create_task',
  'get_tasks',
  'update_task',
  'delete_task',
  'create_note',
  'get_notes',
  'create_reminder',
  'get_reminders',
  'create_idea',
  'get_ideas',
}


class Colors:
  RESET = '\033[0m'
  GREEN = '\033[32m'
  RED = '\033[31m'
  YELLOW = '\033[33m'
  CYAN = '\033[36m'


class TestFailure(Exception):
  pass


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
  path: str,
  *,
  expected_status: int | None = 200,
  json_body: dict[str, Any] | None = None,
  params: dict[str, Any] | None = None,
) -> tuple[int, Any, float]:
  started_at = time.perf_counter()
  response = client.request(
    method,
    f'{MCP_BASE_URL}{path}',
    json=json_body,
    params=params,
  )
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


def execute_tool(
  client: httpx.Client,
  tool_name: str,
  input_data: dict[str, Any],
  *,
  expected_status: int = 200,
) -> tuple[Any, float]:
  status_code, payload, duration_ms = perform_request(
    client,
    'POST',
    '/execute',
    expected_status=expected_status,
    json_body={
      'tool': tool_name,
      'input': input_data,
    },
  )

  if expected_status == 200:
    assert_condition(isinstance(payload, dict), 'Tool response must be a JSON object.')
    assert_condition(payload.get('tool') == tool_name, 'Tool response name mismatch.')
    assert_condition('result' in payload, 'Tool response must include result.')
    return payload['result'], duration_ms

  assert_condition(status_code == expected_status, 'Unexpected error status code.')
  return payload, duration_ms


def expect_error(
  client: httpx.Client,
  tool_name: str,
  input_data: dict[str, Any],
  expected_status: int,
  description: str,
) -> None:
  payload, duration_ms = execute_tool(
    client,
    tool_name,
    input_data,
    expected_status=expected_status,
  )
  assert_condition(isinstance(payload, dict), 'Error response must be a JSON object.')
  assert_condition(payload.get('success') is False, 'Error response must set success=false.')
  assert_condition('error' in payload, 'Error response must include error payload.')
  log_pass(f'{description} ({duration_ms:.1f} ms)')


def find_by_id(items: Iterable[dict[str, Any]], item_id: str) -> dict[str, Any] | None:
  for item in items:
    if item.get('id') == item_id:
      return item
  return None


def wait_for_mcp(client: httpx.Client) -> None:
  last_error: Exception | None = None

  for attempt in range(1, HEALTH_RETRY_COUNT + 1):
    try:
      _, payload, duration_ms = perform_request(
        client,
        'GET',
        '/health',
        expected_status=200,
      )
      assert_condition(isinstance(payload, dict), 'Health response must be a JSON object.')
      assert_condition(payload.get('status') == 'ok', 'Health status must be "ok".')
      log_pass(f'health check ({duration_ms:.1f} ms)')
      return
    except (httpx.HTTPError, TestFailure) as exc:
      last_error = exc
      if attempt < HEALTH_RETRY_COUNT:
        log_info(f'Waiting for MCP server ({attempt}/{HEALTH_RETRY_COUNT})...')
        time.sleep(HEALTH_RETRY_DELAY_SECONDS)

  raise TestFailure(f'MCP server did not become healthy: {last_error}')


def test_tools_discovery(client: httpx.Client) -> None:
  _, payload, duration_ms = perform_request(client, 'GET', '/tools', expected_status=200)
  assert_condition(isinstance(payload, list), '/tools must return a list.')

  discovered_names = {tool.get('name') for tool in payload if isinstance(tool, dict)}
  missing_tools = EXPECTED_TOOLS - discovered_names
  assert_condition(not missing_tools, f'Missing tools from discovery: {sorted(missing_tools)}')

  for tool in payload:
    assert_condition(isinstance(tool, dict), 'Each tool definition must be an object.')
    for field_name in ('name', 'description', 'category', 'input_schema', 'example_input'):
      assert_condition(field_name in tool, f'Tool metadata missing field "{field_name}".')

  log_pass(f'tools discovery ({duration_ms:.1f} ms)')


def test_task_flow(client: httpx.Client) -> None:
  suffix = f'{int(time.time() * 1000)}'
  created_task, duration_ms = execute_tool(
    client,
    'create_task',
    {
      'title': f'MCP task {suffix}',
      'description': 'Created by end-to-end MCP test',
      'priority': 'medium',
    },
  )
  assert_condition(isinstance(created_task, dict), 'create_task result must be an object.')
  task_id = created_task.get('id')
  assert_condition(isinstance(task_id, str), 'Created task must include an id.')
  log_pass(f'create_task ({duration_ms:.1f} ms)')

  tasks, duration_ms = execute_tool(client, 'get_tasks', {})
  assert_condition(isinstance(tasks, list), 'get_tasks result must be a list.')
  fetched_task = find_by_id(tasks, task_id)
  assert_condition(fetched_task is not None, 'Created task was not returned by get_tasks.')
  log_pass(f'get_tasks after create ({duration_ms:.1f} ms)')

  updated_task, duration_ms = execute_tool(
    client,
    'update_task',
    {
      'id': task_id,
      'title': f'MCP task updated {suffix}',
      'status': 'doing',
    },
  )
  assert_condition(isinstance(updated_task, dict), 'update_task result must be an object.')
  assert_condition(updated_task.get('title') == f'MCP task updated {suffix}', 'Task title was not updated.')
  assert_condition(updated_task.get('status') == 'doing', 'Task status was not updated.')
  log_pass(f'update_task ({duration_ms:.1f} ms)')

  tasks, duration_ms = execute_tool(client, 'get_tasks', {})
  fetched_task = find_by_id(tasks, task_id)
  assert_condition(fetched_task is not None, 'Updated task was not returned by get_tasks.')
  assert_condition(fetched_task.get('title') == f'MCP task updated {suffix}', 'Fetched task title mismatch.')
  log_pass(f'get_tasks after update ({duration_ms:.1f} ms)')

  _, duration_ms = execute_tool(client, 'delete_task', {'id': task_id})
  log_pass(f'delete_task ({duration_ms:.1f} ms)')

  tasks, duration_ms = execute_tool(client, 'get_tasks', {})
  assert_condition(find_by_id(tasks, task_id) is None, 'Deleted task still appears in get_tasks.')
  log_pass(f'get_tasks after delete ({duration_ms:.1f} ms)')


def test_idea_note_flow(client: httpx.Client) -> None:
  suffix = f'{int(time.time() * 1000)}'

  created_idea, duration_ms = execute_tool(
    client,
    'create_idea',
    {
      'title': f'MCP idea {suffix}',
      'description': 'Created by integration test',
      'status': 'idea',
    },
  )
  assert_condition(isinstance(created_idea, dict), 'create_idea result must be an object.')
  idea_id = created_idea.get('id')
  assert_condition(isinstance(idea_id, str), 'Created idea must include an id.')
  log_pass(f'create_idea ({duration_ms:.1f} ms)')

  ideas, duration_ms = execute_tool(client, 'get_ideas', {})
  assert_condition(isinstance(ideas, list), 'get_ideas result must be a list.')
  assert_condition(find_by_id(ideas, idea_id) is not None, 'Created idea was not returned by get_ideas.')
  log_pass(f'get_ideas ({duration_ms:.1f} ms)')

  created_note, duration_ms = execute_tool(
    client,
    'create_note',
    {
      'content': f'Idea note {suffix}',
      'attached_to_type': 'idea',
      'attached_to_id': idea_id,
    },
  )
  assert_condition(isinstance(created_note, dict), 'create_note result must be an object.')
  note_id = created_note.get('id')
  assert_condition(isinstance(note_id, str), 'Created note must include an id.')
  assert_condition(created_note.get('attached_to_id') == idea_id, 'Created note attached_to_id mismatch.')
  log_pass(f'create_note ({duration_ms:.1f} ms)')

  notes, duration_ms = execute_tool(client, 'get_notes', {})
  assert_condition(isinstance(notes, list), 'get_notes result must be a list.')
  fetched_note = find_by_id(notes, note_id)
  assert_condition(fetched_note is not None, 'Created note was not returned by get_notes.')
  assert_condition(fetched_note.get('attached_to_id') == idea_id, 'Fetched note attached_to_id mismatch.')
  log_pass(f'get_notes ({duration_ms:.1f} ms)')


def test_reminder_flow(client: httpx.Client) -> None:
  scheduled_at = (
    datetime.now(timezone.utc) + timedelta(hours=1)
  ).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

  created_reminder, duration_ms = execute_tool(
    client,
    'create_reminder',
    {
      'type': 'notification',
      'scheduled_at': scheduled_at,
    },
  )
  assert_condition(isinstance(created_reminder, dict), 'create_reminder result must be an object.')
  reminder_id = created_reminder.get('id')
  assert_condition(isinstance(reminder_id, str), 'Created reminder must include an id.')
  log_pass(f'create_reminder ({duration_ms:.1f} ms)')

  reminders, duration_ms = execute_tool(client, 'get_reminders', {})
  assert_condition(isinstance(reminders, list), 'get_reminders result must be a list.')
  assert_condition(find_by_id(reminders, reminder_id) is not None, 'Created reminder was not returned by get_reminders.')
  log_pass(f'get_reminders ({duration_ms:.1f} ms)')


def test_error_cases(client: httpx.Client) -> None:
  _, payload, duration_ms = perform_request(
    client,
    'POST',
    '/execute',
    expected_status=404,
    json_body={
      'tool': 'does_not_exist',
      'input': {},
    },
  )
  assert_condition(isinstance(payload, dict), 'Invalid tool response must be an object.')
  assert_condition(payload.get('success') is False, 'Invalid tool response must set success=false.')
  log_pass(f'invalid tool name ({duration_ms:.1f} ms)')

  expect_error(
    client,
    'create_task',
    {},
    422,
    'missing required fields',
  )
  expect_error(
    client,
    'delete_task',
    {'id': 'not-a-uuid'},
    422,
    'invalid UUID',
  )
  expect_error(
    client,
    'create_reminder',
    {'type': 'notification', 'scheduled_at': 'not-a-date'},
    422,
    'invalid date',
  )


def run_critical(test_name: str, fn) -> None:
  try:
    fn()
  except Exception as exc:
    log_fail(f'{test_name} -> {exc}')
    raise


def run_non_critical(test_name: str, fn, failures: list[str]) -> None:
  try:
    fn()
  except Exception as exc:
    failures.append(f'{test_name}: {exc}')
    log_fail(f'{test_name} -> {exc}')


def main() -> int:
  failures: list[str] = []

  with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
    run_critical('health check', lambda: wait_for_mcp(client))
    run_critical('tools discovery', lambda: test_tools_discovery(client))
    run_critical('task flow', lambda: test_task_flow(client))

    run_non_critical('idea + note flow', lambda: test_idea_note_flow(client), failures)
    run_non_critical('reminder flow', lambda: test_reminder_flow(client), failures)
    run_non_critical('error cases', lambda: test_error_cases(client), failures)

  if failures:
    log_fail(f'{len(failures)} non-critical test group(s) failed.')
    for failure in failures:
      print(f'  - {failure}')
    return 1

  log_pass('All MCP end-to-end checks passed.')
  return 0


if __name__ == '__main__':
  try:
    raise SystemExit(main())
  except TestFailure as exc:
    log_fail(str(exc))
    raise SystemExit(1) from exc
