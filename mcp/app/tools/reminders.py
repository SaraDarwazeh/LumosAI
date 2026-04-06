from app.client.backend_client import BackendClient
from app.schemas.tool_schemas import CreateReminderInput, GetRemindersInput


async def create_reminder(
  client: BackendClient,
  tool_input: CreateReminderInput,
  backend_headers: dict[str, str],
):
  return await client.post(
    '/reminders',
    json_body=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )


async def get_reminders(
  client: BackendClient,
  tool_input: GetRemindersInput,
  backend_headers: dict[str, str],
):
  return await client.get(
    '/reminders',
    params=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )
