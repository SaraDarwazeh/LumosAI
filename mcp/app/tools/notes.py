from app.client.backend_client import BackendClient
from app.schemas.tool_schemas import CreateNoteInput, GetNotesInput


async def create_note(
  client: BackendClient,
  tool_input: CreateNoteInput,
  backend_headers: dict[str, str],
):
  return await client.post(
    '/notes',
    json_body=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )


async def get_notes(
  client: BackendClient,
  tool_input: GetNotesInput,
  backend_headers: dict[str, str],
):
  return await client.get(
    '/notes',
    params=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )
