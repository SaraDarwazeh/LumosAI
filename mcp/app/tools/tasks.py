from app.client.backend_client import BackendClient
from app.schemas.tool_schemas import (
  CreateTaskInput,
  DeleteTaskInput,
  GetTasksInput,
  UpdateTaskInput,
)


async def create_task(
  client: BackendClient,
  tool_input: CreateTaskInput,
  backend_headers: dict[str, str],
):
  return await client.post(
    '/tasks',
    json_body=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )


async def get_tasks(
  client: BackendClient,
  tool_input: GetTasksInput,
  backend_headers: dict[str, str],
):
  return await client.get(
    '/tasks',
    params=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )


async def update_task(
  client: BackendClient,
  tool_input: UpdateTaskInput,
  backend_headers: dict[str, str],
):
  payload = tool_input.model_dump(mode='json', exclude_none=True)
  task_id = payload.pop('id')

  return await client.patch(
    f'/tasks/{task_id}',
    json_body=payload,
    headers=backend_headers,
  )


async def delete_task(
  client: BackendClient,
  tool_input: DeleteTaskInput,
  backend_headers: dict[str, str],
):
  return await client.delete(f'/tasks/{tool_input.id}', headers=backend_headers)
