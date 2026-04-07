from app.client.backend_client import BackendClient
from app.schemas.tool_schemas import (
  CreateIdeaInput,
  DeleteIdeaInput,
  GetIdeasInput,
  UpdateIdeaInput,
)


async def create_idea(
  client: BackendClient,
  tool_input: CreateIdeaInput,
  backend_headers: dict[str, str],
):
  return await client.post(
    '/ideas',
    json_body=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )


async def get_ideas(
  client: BackendClient,
  tool_input: GetIdeasInput,
  backend_headers: dict[str, str],
):
  return await client.get(
    '/ideas',
    params=tool_input.model_dump(mode='json', exclude_none=True),
    headers=backend_headers,
  )


async def update_idea(
  client: BackendClient,
  tool_input: UpdateIdeaInput,
  backend_headers: dict[str, str],
):
  payload = tool_input.model_dump(mode='json', exclude_none=True)
  idea_id = payload.pop('id')

  return await client.patch(
    f'/ideas/{idea_id}',
    json_body=payload,
    headers=backend_headers,
  )


async def delete_idea(
  client: BackendClient,
  tool_input: DeleteIdeaInput,
  backend_headers: dict[str, str],
):
  return await client.delete(f'/ideas/{tool_input.id}', headers=backend_headers)
