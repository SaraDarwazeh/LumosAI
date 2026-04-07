from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import UUID4, BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictSchema(BaseModel):
  model_config = ConfigDict(extra='forbid')


class ToolMetadata(StrictSchema):
  name: str
  description: str
  category: str
  input_schema: dict[str, Any]
  example_input: dict[str, Any]


class ExecuteToolRequest(StrictSchema):
  user_id: UUID4
  firebase_token: str | None = None
  tool: str = Field(min_length=1)
  input: dict[str, Any] = Field(default_factory=dict)


class ExecuteToolResponse(StrictSchema):
  user_id: UUID4
  tool: str
  result: Any


class CreateTaskInput(StrictSchema):
  title: str = Field(min_length=1)
  description: str | None = None
  due_date: datetime | None = None
  priority: Literal['low', 'medium', 'high'] | None = None
  labels: list[UUID4] | None = None


class GetTasksInput(StrictSchema):
  status: Literal['todo', 'doing', 'done'] | None = None
  due_date: datetime | None = None
  label_id: UUID4 | None = None


class UpdateTaskInput(StrictSchema):
  id: UUID4
  title: str | None = Field(default=None, min_length=1)
  description: str | None = None
  status: Literal['todo', 'doing', 'done'] | None = None
  due_date: datetime | None = None
  priority: Literal['low', 'medium', 'high'] | None = None


class DeleteTaskInput(StrictSchema):
  id: UUID4


class CreateNoteInput(StrictSchema):
  content: str = Field(min_length=1)
  attached_to_type: Literal['task', 'idea', 'none']
  attached_to_id: UUID4 | None = None

  @model_validator(mode='after')
  def validate_attachment(self):
    if self.attached_to_type == 'none' and self.attached_to_id is not None:
      raise ValueError('attached_to_id must not be provided when attached_to_type is "none".')

    if self.attached_to_type in {'task', 'idea'} and self.attached_to_id is None:
      raise ValueError(
        'attached_to_id is required when attached_to_type is "task" or "idea".',
      )

    return self


class GetNotesInput(StrictSchema):
  pass


class UpdateNoteInput(StrictSchema):
  id: UUID4
  content: str | None = Field(default=None, min_length=1)
  attached_to_type: Literal['task', 'idea', 'none'] | None = None
  attached_to_id: UUID4 | None = None

  @model_validator(mode='after')
  def validate_attachment(self):
    # Only validate if attached_to_type is being updated
    if self.attached_to_type is not None:
      if self.attached_to_type == 'none' and self.attached_to_id is not None:
        raise ValueError('attached_to_id must not be provided when attached_to_type is "none".')

      if self.attached_to_type in {'task', 'idea'} and self.attached_to_id is None:
        raise ValueError(
          'attached_to_id is required when attached_to_type is "task" or "idea".',
        )

    return self


class DeleteNoteInput(StrictSchema):
  id: UUID4


class CreateReminderInput(StrictSchema):
  task_id: UUID4 | None = None
  type: Literal['notification', 'alarm', 'external']
  scheduled_at: datetime

  @field_validator('scheduled_at')
  @classmethod
  def validate_scheduled_at(cls, value: datetime):
    normalized_value = (
      value.astimezone(timezone.utc)
      if value.tzinfo is not None
      else value.replace(tzinfo=timezone.utc)
    )

    if normalized_value <= datetime.now(timezone.utc):
      raise ValueError('scheduled_at must be a future datetime.')

    return value


class GetRemindersInput(StrictSchema):
  task_id: UUID4 | None = None
  status: Literal['pending', 'sent'] | None = None


class CreateIdeaInput(StrictSchema):
  title: str = Field(min_length=1)
  description: str | None = None
  status: Literal['idea', 'exploring', 'building', 'done'] | None = None


class GetIdeasInput(StrictSchema):
  pass


class UpdateIdeaInput(StrictSchema):
  id: UUID4
  title: str | None = Field(default=None, min_length=1)
  description: str | None = None
  status: Literal['idea', 'exploring', 'building', 'done'] | None = None


class DeleteIdeaInput(StrictSchema):
  id: UUID4
