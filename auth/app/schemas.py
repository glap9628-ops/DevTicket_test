from datetime import datetime
from typing import Generic, Literal, TypeVar
from pydantic import BaseModel, Field


T = TypeVar("T")


# ─── Auth Schemas ─────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    group_id: int | None = None
    group_name: str


class LoginResponse(BaseModel):
    message: str
    user: UserInfo


class ClientSettings(BaseModel):
    auto_logout_seconds: int
    jwt_refresh_interval_seconds: int


class MeResponse(BaseModel):
    id: int
    username: str
    display_name: str
    email: str | None
    role: str
    group_id: int
    group_name: str
    position_id: int | None
    position_name: str | None
    role_id: int | None
    role_name: str | None
    avatar_path: str | None
    last_login_at: datetime | None
    created_at: datetime
    settings: ClientSettings


# ─── Pagination ───────────────────────────────────

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


# ─── Group Schemas ────────────────────────────────

class GroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class GroupUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class GroupResponse(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GroupItem(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    user_count: int
    created_at: datetime
    updated_at: datetime


class GroupUserBrief(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool


class GroupDetailResponse(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    user_count: int
    users: list[GroupUserBrief]
    created_at: datetime
    updated_at: datetime


# ─── User Schemas ─────────────────────────────────

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=100)
    email: str | None = Field(None, max_length=255)
    role: Literal["admin", "user"] = "user"
    group_id: int
    position_id: int | None = None
    role_id: int | None = None


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=100)
    email: str | None = Field(None, max_length=255)
    role: Literal["admin", "user"] | None = None
    group_id: int | None = None
    position_id: int | None = None
    role_id: int | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=8, max_length=128)


class UserItem(BaseModel):
    id: int
    username: str
    display_name: str
    email: str | None
    role: str
    group_id: int
    group_name: str
    position_id: int | None
    position_name: str | None
    role_id: int | None
    role_name: str | None
    is_active: bool
    avatar_path: str | None
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserCreateResponse(BaseModel):
    id: int
    username: str
    display_name: str
    email: str | None
    role: str
    group_id: int
    group_name: str
    position_id: int | None
    position_name: str | None
    role_id: int | None
    role_name: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ─── Role Schemas ─────────────────────────────────

class RoleItem(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: str | None = Field(None, max_length=500)


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None
    sort_order: int | None = None


# ─── Position Schemas ─────────────────────────────

class PositionItem(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    sort_order: int
    user_count: int
    created_at: datetime
    updated_at: datetime


class PositionCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: str | None = Field(None, max_length=500)


class PositionUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None
    sort_order: int | None = None


# ─── Settings Schemas ─────────────────────────────

class SettingsResponse(BaseModel):
    auto_logout_seconds: int
    jwt_expire_seconds: int
    jwt_refresh_interval_seconds: int
    updated_at: datetime
    updated_by: int | None


class SettingsUpdateRequest(BaseModel):
    auto_logout_seconds: int | None = Field(None, ge=60, le=86400)
    jwt_expire_seconds: int | None = Field(None, ge=300, le=86400)
    jwt_refresh_interval_seconds: int | None = Field(None, ge=60, le=43200)


# ─── App Order Schemas ────────────────────────────

class AppOrderResponse(BaseModel):
    app_order: list[str]


class AppOrderUpdateRequest(BaseModel):
    app_order: list[str]


# ─── Profile Schemas ──────────────────────────────

class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=100)
    email: str | None = Field(None, max_length=255)
    current_password: str | None = Field(None, max_length=128)
    new_password: str | None = Field(None, min_length=8, max_length=128)


# ─── App Schemas ──────────────────────────────────

class AppItem(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    icon: str
    path: str
    color: str
    admin_path: str | None
    open_in_new_tab: bool
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AppCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    description: str | None = Field(None, max_length=500)
    icon: str = Field("Box", max_length=50)
    path: str = Field(..., max_length=255)
    color: str = Field("#3B82F6", max_length=20)
    admin_path: str | None = Field(None, max_length=255)
    open_in_new_tab: bool = True


class AppUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    icon: str | None = Field(None, max_length=50)
    path: str | None = Field(None, max_length=255)
    color: str | None = Field(None, max_length=20)
    admin_path: str | None = None
    open_in_new_tab: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class PublicAppItem(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    path: str
    color: str
    open_in_new_tab: bool


# ─── App Group Access Schemas ─────────────────────

class AppGroupAccessResponse(BaseModel):
    app_id: int
    group_ids: list[int]


class AppGroupAccessUpdateRequest(BaseModel):
    group_ids: list[int]


# ─── App User Access Schemas ──────────────────────

class AppUserAccessResponse(BaseModel):
    app_id: int
    user_ids: list[int]


class AppUserAccessUpdateRequest(BaseModel):
    user_ids: list[int]


# ─── App Feature Schemas ──────────────────────────

class AppFeatureItem(BaseModel):
    id: int
    app_id: int
    name: str
    slug: str
    icon: str | None
    description: str | None
    sort_order: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AppFeatureCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    icon: str | None = Field(None, max_length=50)
    description: str | None = Field(None, max_length=500)
    sort_order: int = Field(0, ge=0)
    is_active: bool = True


class AppFeatureUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    icon: str | None = None
    description: str | None = None
    sort_order: int | None = Field(None, ge=0)
    is_active: bool | None = None


class AppFeatureAccessResponse(BaseModel):
    feature_id: int
    group_ids: list[int]
    user_ids: list[int]
    role_ids: list[int]
    position_ids: list[int]


class AppFeatureAccessUpdateRequest(BaseModel):
    group_ids: list[int] = []
    user_ids: list[int] = []
    role_ids: list[int] = []
    position_ids: list[int] = []


# ─── Bulk Delete ─────────────────────────────────

class BulkDeleteRequest(BaseModel):
    ids: list[int]


class BulkDeleteFailure(BaseModel):
    id: int
    reason: str


class BulkDeleteResponse(BaseModel):
    deleted: list[int]
    failed: list[BulkDeleteFailure]


# ─── Common ───────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
