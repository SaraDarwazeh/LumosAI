from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

from app.client.backend_client import BackendClient, BackendClientError
from app.config import get_settings
from app.schemas.tool_schemas import (
  CreateIdeaInput,
  CreateNoteInput,
  CreateReminderInput,
  CreateTaskInput,
  DeleteTaskInput,
  ExecuteToolRequest,
  ExecuteToolResponse,
  GetIdeasInput,
  GetNotesInput,
  GetRemindersInput,
  GetTasksInput,
  ToolMetadata,
  UpdateTaskInput,
)
from app.tools.ideas import create_idea, get_ideas
from app.tools.notes import create_note, get_notes
from app.tools.reminders import create_reminder, get_reminders
from app.tools.tasks import create_task, delete_task, get_tasks, update_task


ToolHandler = Callable[[BackendClient, BaseModel, dict[str, str]], Awaitable[Any]]


@dataclass(frozen=True)
class ToolRegistration:
  name: str
  description: str
  category: str
  input_model: type[BaseModel]
  example_input: dict[str, Any]
  handler: ToolHandler


TOOL_REGISTRY = {
  'create_task': ToolRegistration(
    name='create_task',
    description='Create a new task in the backend.',
    category='tasks',
    input_model=CreateTaskInput,
    example_input={
      'title': 'Study math',
      'description': 'Review algebra exercises',
      'priority': 'high',
    },
    handler=create_task,
  ),
  'get_tasks': ToolRegistration(
    name='get_tasks',
    description='Fetch tasks with optional status, due date, or label filters.',
    category='tasks',
    input_model=GetTasksInput,
    example_input={
      'status': 'todo',
    },
    handler=get_tasks,
  ),
  'update_task': ToolRegistration(
    name='update_task',
    description='Update an existing task by id.',
    category='tasks',
    input_model=UpdateTaskInput,
    example_input={
      'id': '11111111-1111-4111-8111-111111111111',
      'status': 'doing',
      'priority': 'medium',
    },
    handler=update_task,
  ),
  'delete_task': ToolRegistration(
    name='delete_task',
    description='Delete a task by id.',
    category='tasks',
    input_model=DeleteTaskInput,
    example_input={
      'id': '11111111-1111-4111-8111-111111111111',
    },
    handler=delete_task,
  ),
  'create_note': ToolRegistration(
    name='create_note',
    description='Create a new note, optionally attached to a task or idea.',
    category='notes',
    input_model=CreateNoteInput,
    example_input={
      'content': 'Summarize today’s meeting',
      'attached_to_type': 'none',
    },
    handler=create_note,
  ),
  'get_notes': ToolRegistration(
    name='get_notes',
    description='Fetch all notes for the current user.',
    category='notes',
    input_model=GetNotesInput,
    example_input={},
    handler=get_notes,
  ),
  'create_reminder': ToolRegistration(
    name='create_reminder',
    description='Create a new reminder, optionally linked to a task.',
    category='reminders',
    input_model=CreateReminderInput,
    example_input={
      'type': 'notification',
      'scheduled_at': '2030-01-15T09:00:00Z',
    },
    handler=create_reminder,
  ),
  'get_reminders': ToolRegistration(
    name='get_reminders',
    description='Fetch reminders with optional task or status filters.',
    category='reminders',
    input_model=GetRemindersInput,
    example_input={
      'status': 'pending',
    },
    handler=get_reminders,
  ),
  'create_idea': ToolRegistration(
    name='create_idea',
    description='Create a new idea entry.',
    category='ideas',
    input_model=CreateIdeaInput,
    example_input={
      'title': 'Personal knowledge assistant',
      'status': 'idea',
    },
    handler=create_idea,
  ),
  'get_ideas': ToolRegistration(
    name='get_ideas',
    description='Fetch all ideas for the current user.',
    category='ideas',
    input_model=GetIdeasInput,
    example_input={},
    handler=get_ideas,
  ),
}


def build_error_payload(message: str, details: Any | None = None) -> dict[str, Any]:
  payload: dict[str, Any] = {
    'success': False,
    'error': {
      'message': message,
    },
  }

  if details is not None:
    payload['error']['details'] = details

  return payload


def extract_error_message(detail: Any) -> str:
  if isinstance(detail, str):
    return detail

  if isinstance(detail, list):
    return 'Request validation failed.'

  if isinstance(detail, dict):
    message = detail.get('message')
    if isinstance(message, str):
      return message

  return 'Request failed.'


def build_backend_headers(payload: ExecuteToolRequest) -> dict[str, str]:
  headers = {
    'X-User-Id': str(payload.user_id),
  }

  if payload.firebase_token is not None:
    headers['Authorization'] = f'Bearer {payload.firebase_token}'

  return headers


@asynccontextmanager
async def lifespan(app: FastAPI):
  settings = get_settings()
  backend_client = BackendClient(
    base_url=settings.backend_base_url,
    timeout=settings.request_timeout,
  )
  app.state.backend_client = backend_client
  app.state.settings = settings

  try:
    yield
  finally:
    await backend_client.close()


app = FastAPI(
  title=get_settings().app_name,
  version=get_settings().app_version,
  lifespan=lifespan,
)


@app.exception_handler(BackendClientError)
async def backend_client_error_handler(
  _request: Request,
  exc: BackendClientError,
):
  return JSONResponse(
    status_code=exc.status_code,
    content=build_error_payload(exc.message, exc.details),
  )


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
  _request: Request,
  exc: RequestValidationError,
):
  return JSONResponse(
    status_code=422,
    content=build_error_payload('Request validation failed.', exc.errors()),
  )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
  return JSONResponse(
    status_code=exc.status_code,
    content=build_error_payload(extract_error_message(exc.detail), exc.detail),
  )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
  return JSONResponse(
    status_code=500,
    content=build_error_payload(
      'An unexpected error occurred.',
      {'exception_type': exc.__class__.__name__},
    ),
  )


@app.get('/health')
async def healthcheck():
  settings = get_settings()
  return {
    'status': 'ok',
    'backend_base_url': settings.backend_base_url,
  }


@app.get('/tools', response_model=list[ToolMetadata])
async def list_tools():
  return [
    ToolMetadata(
      name=tool.name,
      description=tool.description,
      category=tool.category,
      input_schema=tool.input_model.model_json_schema(),
      example_input=tool.example_input,
    )
    for tool in TOOL_REGISTRY.values()
  ]


@app.post('/execute', response_model=ExecuteToolResponse)
async def execute_tool(payload: ExecuteToolRequest, request: Request):
  tool = TOOL_REGISTRY.get(payload.tool)
  if tool is None:
    raise HTTPException(status_code=404, detail=f'Unknown tool "{payload.tool}".')

  try:
    validated_input = tool.input_model.model_validate(payload.input)
  except ValidationError as exc:
    raise HTTPException(status_code=422, detail=exc.errors()) from exc

  backend_client: BackendClient = request.app.state.backend_client
  result = await tool.handler(
    backend_client,
    validated_input,
    build_backend_headers(payload),
  )

  return ExecuteToolResponse(user_id=payload.user_id, tool=tool.name, result=result)
