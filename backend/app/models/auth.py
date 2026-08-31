from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr


AccountStatus = Literal["active", "disabled"]


class UserAccountDto(BaseModel):
    """Public account shape; intentionally excludes identity keys and credentials."""

    id: UUID
    email: str
    displayName: str
    accountStatus: AccountStatus
    createdAt: datetime
    updatedAt: datetime


class RegisterRequestDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    displayName: str
    password: Annotated[SecretStr, Field(min_length=1, max_length=1024)]


class LoginRequestDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: Annotated[SecretStr, Field(min_length=1, max_length=1024)]


class SessionExpiryDto(BaseModel):
    expiresAt: datetime


class CookieAuthResponseDto(BaseModel):
    user: UserAccountDto
    session: SessionExpiryDto
    transport: Literal["cookie"]


class BearerCredentialDto(BaseModel):
    scheme: Literal["Bearer"] = "Bearer"
    sessionToken: str = Field(repr=False)


class BearerAuthResponseDto(BaseModel):
    user: UserAccountDto
    session: SessionExpiryDto
    transport: Literal["bearer"]
    credential: BearerCredentialDto


IssuedAuthResponseDto = Annotated[
    CookieAuthResponseDto | BearerAuthResponseDto,
    Field(discriminator="transport"),
]


class CurrentSessionResponseDto(BaseModel):
    user: UserAccountDto
    session: SessionExpiryDto
    transport: Literal["cookie", "bearer"]
