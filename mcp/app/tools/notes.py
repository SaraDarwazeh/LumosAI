from app.client.backend_client import BackendClient
from app.schemas.tool_schemas import (
  CreateNoteInput,
  DeleteNoteInput,
  GetNotesInput,
  UpdateNoteInput,
)


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


async def update_note(
  client: BackendClient,
  tool_input: UpdateNoteInput,
  backend_headers: dict[str, str],
):
  payload = tool_input.model_dump(mode='json', exclude_none=True)
  note_id = payload.pop('id')

  return await client.patch(
    f'/notes/{note_id}',
    json_body=payload,
    headers=backend_headers,
  )


async def delete_note(
  client: BackendClient,
  tool_input: DeleteNoteInput,
  backend_headers: dict[str, str],
):
  return await client.delete(f'/notes/{tool_input.id}', headers=backend_headers)
