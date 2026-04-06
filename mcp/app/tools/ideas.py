from app.client.backend_client import BackendClient
from app.schemas.tool_schemas import CreateIdeaInput, GetIdeasInput


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
