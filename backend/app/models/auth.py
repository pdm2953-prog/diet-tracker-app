from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


AccountStatus = Literal["active", "disabled"]


class UserAccountDto(BaseModel):
    """Public account shape; intentionally excludes identity keys and credentials."""

    id: UUID
    email: str
    displayName: str
    accountStatus: AccountStatus
    createdAt: datetime
    updatedAt: datetime
