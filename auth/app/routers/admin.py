"""
관리자 API 라우터
/api/admin/* 엔드포인트를 처리한다.
- 그룹 CRUD
- 사용자 CRUD
- 시스템 설정 조회/변경
- 앱 관리 CRUD
- 역할 관리 CRUD
- 직위 관리 CRUD
"""

import math
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import User, Group, SystemSettings, App, Role, Position, AppGroupAccess, AppUserAccess, AppFeature, AppFeatureAccess
from app.schemas import (
    GroupCreateRequest, GroupUpdateRequest, GroupResponse, GroupItem,
    GroupDetailResponse, GroupUserBrief,
    UserCreateRequest, UserUpdateRequest, UserItem, UserCreateResponse,
    SettingsResponse, SettingsUpdateRequest,
    PaginatedResponse, MessageResponse,
    AppItem, AppCreateRequest, AppUpdateRequest,
    RoleItem, RoleCreateRequest, RoleUpdateRequest,
    PositionItem, PositionCreateRequest, PositionUpdateRequest,
    AppGroupAccessResponse, AppGroupAccessUpdateRequest,
    AppUserAccessResponse, AppUserAccessUpdateRequest,
    AppFeatureItem, AppFeatureCreateRequest, AppFeatureUpdateRequest,
    AppFeatureAccessResponse, AppFeatureAccessUpdateRequest,
    BulkDeleteRequest, BulkDeleteResponse, BulkDeleteFailure,
)
from app.dependencies import require_admin
from app.services.user_service import (
    get_users_paginated, get_user_by_id, get_user_by_username,
    create_user, update_user, delete_user, count_active_admins, group_is_active,
)
from app.services.group_service import (
    get_groups_paginated, get_group_by_id, get_group_detail,
    group_name_exists, create_group, update_group, delete_group,
    group_has_users,
)
from app.services.settings_service import settings_cache

router = APIRouter()


# ═══════════════════════════════════════════════════
# 그룹 관리
# ═══════════════════════════════════════════════════

@router.get("/groups", response_model=PaginatedResponse[GroupItem])
async def list_groups(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    items, total = await get_groups_paginated(
        db, page=page, size=size, search=search, is_active=is_active
    )
    pages_count = math.ceil(total / size) if total > 0 else 1
    return PaginatedResponse[GroupItem](
        items=[GroupItem(**item) for item in items],
        total=total, page=page, size=size, pages=pages_count,
    )


@router.post("/groups", response_model=GroupResponse, status_code=201)
async def create_group_endpoint(
    body: GroupCreateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if await group_name_exists(db, body.name):
        raise HTTPException(status_code=409, detail="이미 존재하는 그룹명입니다")
    group = await create_group(db, name=body.name, description=body.description)
    return GroupResponse.model_validate(group, from_attributes=True)


@router.get("/groups/{group_id}", response_model=GroupDetailResponse)
async def get_group_endpoint(
    group_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    detail = await get_group_detail(db, group_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")
    return GroupDetailResponse(
        id=detail["id"],
        name=detail["name"],
        description=detail["description"],
        is_active=detail["is_active"],
        user_count=detail["user_count"],
        users=[GroupUserBrief(**u) for u in detail["users"]],
        created_at=detail["created_at"],
        updated_at=detail["updated_at"],
    )


@router.put("/groups/{group_id}", response_model=GroupResponse)
async def update_group_endpoint(
    group_id: int,
    body: GroupUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    group = await get_group_by_id(db, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")

    if body.name is not None:
        if await group_name_exists(db, body.name, exclude_id=group_id):
            raise HTTPException(status_code=409, detail="이미 존재하는 그룹명입니다")

    updated = await update_group(
        db, group,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
    )
    return GroupResponse.model_validate(updated, from_attributes=True)


@router.delete("/groups/{group_id}", response_model=MessageResponse)
async def delete_group_endpoint(
    group_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    group = await get_group_by_id(db, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")

    if await group_has_users(db, group_id):
        raise HTTPException(status_code=409, detail="소속 사용자가 있는 그룹은 삭제할 수 없습니다")

    await delete_group(db, group)
    return MessageResponse(message="그룹이 삭제되었습니다")


@router.post("/sso/sync")
async def sync_sso_users(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """SSO 서버에서 전체 사용자를 가져와 로컬 DB에 동기화한다."""
    from app.config import settings
    from app.sso_client import sso_client
    from app.models import Group, Role

    if not settings.sso_enabled:
        raise HTTPException(status_code=400, detail="SSO가 설정되지 않았습니다.")

    # ── 기본 role_id (user) 조회 ──────────────────────────────────────
    role_result = await db.execute(
        select(Role).where(Role.name == "user", Role.is_active == True)
    )
    default_role = role_result.scalar_one_or_none()
    default_role_id: int = default_role.id if default_role else 1001

    # ── 그룹 찾기/생성 헬퍼 ───────────────────────────────────────────
    async def find_or_create_group(dept_id: int | None, dept_name: str | None) -> int | None:
        if dept_id is None:
            return None  # 부서 정보 없으면 미배정
        result = await db.execute(select(Group).where(Group.sso_dept_id == dept_id))
        g = result.scalar_one_or_none()
        if g:
            return g.id
        g = Group(name=dept_name or f"부서-{dept_id}", sso_dept_id=dept_id, is_active=True)
        db.add(g)
        await db.flush()
        return g.id

    created = updated = deactivated = 0
    page = 0

    while True:
        try:
            payload = await sso_client.sync_end_users(page=page, page_size=500)
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e))

        users_data = payload.get("data", [])
        deletions  = payload.get("deletions", [])

        # ── 활성 사용자 동기화 ────────────────────────────────────────
        for u in users_data:
            # sync API: endUserId / login API: userId — 동일 PK
            sso_uid = u.get("endUserId") or u.get("userId")
            name    = u.get("name", "")
            email   = u.get("email")
            emp_no  = u.get("employeeNo", "")

            # username: loginId(있으면) → 이메일 앞부분 → 사번
            login_id = (
                u.get("loginId")
                or (email.split("@")[0] if email else None)
                or emp_no
                or ""
            )

            # primaryDepartment: departments 배열에서 primary=True 항목
            depts     = u.get("departments") or []
            pri_dept  = next((d for d in depts if d.get("primary")), depts[0] if depts else {})
            dept_id   = pri_dept.get("departmentId")
            dept_name = pri_dept.get("departmentName")

            # 퇴사자 처리
            if u.get("status") == "retired" or u.get("leaveDate"):
                if sso_uid:
                    r = await db.execute(select(User).where(User.sso_user_id == sso_uid))
                    ex = r.scalar_one_or_none()
                    if ex and ex.is_active:
                        ex.is_active = False
                        deactivated += 1
                continue

            if not sso_uid or not login_id:
                continue

            r = await db.execute(select(User).where(User.sso_user_id == sso_uid))
            user = r.scalar_one_or_none()

            if user:
                changed = False
                if name and user.display_name != name:
                    user.display_name = name; changed = True
                if email and user.email != email:
                    user.email = email; changed = True
                if changed:
                    updated += 1
            else:
                r2 = await db.execute(select(User).where(User.username == login_id))
                user = r2.scalar_one_or_none()
                if user:
                    user.sso_user_id = sso_uid
                    user.password_hash = None
                    if name: user.display_name = name
                    if email: user.email = email
                    updated += 1
                else:
                    gid = await find_or_create_group(dept_id, dept_name)
                    db.add(User(
                        username=login_id,
                        password_hash=None,
                        display_name=name,
                        email=email,
                        sso_user_id=sso_uid,
                        group_id=gid,
                        role_id=default_role_id,
                        is_active=True,
                    ))
                    created += 1

        # ── 퇴사/삭제자 → 비활성 처리 ────────────────────────────────
        for d in deletions:
            sso_uid = d.get("userId")
            if not sso_uid:
                continue
            r = await db.execute(select(User).where(User.sso_user_id == sso_uid))
            user = r.scalar_one_or_none()
            if user and user.is_active:
                user.is_active = False
                deactivated += 1

        if len(users_data) < 500:
            break
        page += 1

    await db.commit()
    return {
        "created": created,
        "updated": updated,
        "deactivated": deactivated,
        "message": f"동기화 완료: 신규 {created}명, 갱신 {updated}명, 비활성 {deactivated}명",
    }


@router.post("/groups/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_groups(
    body: BulkDeleteRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    deleted = []
    failed = []
    for gid in body.ids:
        group = await get_group_by_id(db, gid)
        if group is None:
            failed.append(BulkDeleteFailure(id=gid, reason="그룹을 찾을 수 없습니다"))
            continue
        if await group_has_users(db, gid):
            failed.append(BulkDeleteFailure(id=gid, reason=f"'{group.name}' 그룹에 소속 사용자가 있어 삭제할 수 없습니다"))
            continue
        await delete_group(db, group)
        deleted.append(gid)
    return BulkDeleteResponse(deleted=deleted, failed=failed)


# ═══════════════════════════════════════════════════
# 사용자 관리
# ═══════════════════════════════════════════════════

@router.get("/users", response_model=PaginatedResponse[UserItem])
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=1000),
    search: str | None = Query(None),
    role: str | None = Query(None),
    group_id: int | None = Query(None),
    is_active: bool | None = Query(None),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    items, total = await get_users_paginated(
        db, page=page, size=size, search=search,
        role=role, group_id=group_id, is_active=is_active,
    )
    pages_count = math.ceil(total / size) if total > 0 else 1
    return PaginatedResponse[UserItem](
        items=[UserItem(**item) for item in items],
        total=total, page=page, size=size, pages=pages_count,
    )


@router.post("/users", response_model=UserCreateResponse, status_code=201)
async def create_user_endpoint(
    body: UserCreateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_user_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=409, detail="이미 존재하는 사용자명입니다")

    if not await group_is_active(db, body.group_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 그룹입니다")

    user = await create_user(
        db,
        username=body.username,
        password=body.password,
        display_name=body.display_name,
        email=body.email,
        role=body.role,
        group_id=body.group_id,
        position_id=body.position_id,
        role_id=body.role_id,
    )
    role_name = user.custom_role.name if user.custom_role else "user"
    return UserCreateResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        role=role_name,
        group_id=user.group_id,
        group_name=user.group.name if user.group else "",
        position_id=user.position_id,
        position_name=user.position.name if user.position else None,
        role_id=user.role_id,
        role_name=role_name,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/users/{user_id}", response_model=UserItem)
async def get_user_endpoint(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    role_name = user.custom_role.name if user.custom_role else "user"
    return UserItem(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        role=role_name,
        group_id=user.group_id,
        group_name=user.group.name if user.group else "",
        position_id=user.position_id,
        position_name=user.position.name if user.position else None,
        role_id=user.role_id,
        role_name=role_name,
        is_active=user.is_active,
        avatar_path=user.avatar_path,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.put("/users/{user_id}", response_model=UserItem)
async def update_user_endpoint(
    user_id: int,
    body: UserUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    if body.group_id is not None:
        if not await group_is_active(db, body.group_id):
            raise HTTPException(status_code=400, detail="유효하지 않은 그룹입니다")

    user_is_admin = user.custom_role is not None and user.custom_role.name == "admin"

    if body.is_active is False and user_is_admin:
        admin_count = await count_active_admins(db)
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="마지막 관리자는 비활성화할 수 없습니다")

    if body.role is not None and body.role != "admin" and user_is_admin:
        admin_count = await count_active_admins(db)
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="마지막 관리자의 역할을 변경할 수 없습니다")

    position_id_val = ... if "position_id" not in body.model_fields_set else body.position_id
    role_id_val = ... if "role_id" not in body.model_fields_set else body.role_id

    updated = await update_user(
        db, user,
        display_name=body.display_name,
        email=body.email,
        role=body.role,
        group_id=body.group_id,
        position_id=position_id_val,
        role_id=role_id_val,
        is_active=body.is_active,
        password=body.password,
    )
    updated_role_name = updated.custom_role.name if updated.custom_role else "user"
    return UserItem(
        id=updated.id,
        username=updated.username,
        display_name=updated.display_name,
        email=updated.email,
        role=updated_role_name,
        group_id=updated.group_id,
        group_name=updated.group.name if updated.group else "",
        position_id=updated.position_id,
        position_name=updated.position.name if updated.position else None,
        role_id=updated.role_id,
        role_name=updated_role_name,
        is_active=updated.is_active,
        avatar_path=updated.avatar_path,
        last_login_at=updated.last_login_at,
        created_at=updated.created_at,
        updated_at=updated.updated_at,
    )


@router.delete("/users/{user_id}", response_model=MessageResponse)
async def delete_user_endpoint(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    if user.id == admin_user.id:
        raise HTTPException(status_code=409, detail="자기 자신은 삭제할 수 없습니다")

    if user.custom_role and user.custom_role.name == "admin":
        admin_count = await count_active_admins(db)
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="마지막 관리자는 삭제할 수 없습니다")

    await delete_user(db, user)
    return MessageResponse(message="사용자가 삭제되었습니다")


@router.post("/users/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_users(
    body: BulkDeleteRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    deleted = []
    failed = []
    for uid in body.ids:
        user = await get_user_by_id(db, uid)
        if user is None:
            failed.append(BulkDeleteFailure(id=uid, reason="사용자를 찾을 수 없습니다"))
            continue
        if user.id == admin_user.id:
            failed.append(BulkDeleteFailure(id=uid, reason="자기 자신은 삭제할 수 없습니다"))
            continue
        if user.custom_role and user.custom_role.name == "admin":
            admin_count = await count_active_admins(db)
            if admin_count <= 1:
                failed.append(BulkDeleteFailure(id=uid, reason="마지막 관리자는 삭제할 수 없습니다"))
                continue
        await delete_user(db, user)
        deleted.append(uid)
    return BulkDeleteResponse(deleted=deleted, failed=failed)


# ═══════════════════════════════════════════════════
# 시스템 설정
# ═══════════════════════════════════════════════════

@router.get("/settings", response_model=SettingsResponse)
async def get_settings(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SystemSettings).where(SystemSettings.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="설정을 찾을 수 없습니다")
    return SettingsResponse(
        auto_logout_seconds=row.auto_logout_seconds,
        jwt_expire_seconds=row.jwt_expire_seconds,
        jwt_refresh_interval_seconds=row.jwt_refresh_interval_seconds,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SystemSettings).where(SystemSettings.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="설정을 찾을 수 없습니다")

    if body.auto_logout_seconds is not None:
        row.auto_logout_seconds = body.auto_logout_seconds
    if body.jwt_expire_seconds is not None:
        row.jwt_expire_seconds = body.jwt_expire_seconds
    if body.jwt_refresh_interval_seconds is not None:
        row.jwt_refresh_interval_seconds = body.jwt_refresh_interval_seconds

    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = admin_user.id
    await db.commit()
    await db.refresh(row)

    settings_cache.update(
        auto_logout=body.auto_logout_seconds,
        jwt_expire=body.jwt_expire_seconds,
        jwt_refresh=body.jwt_refresh_interval_seconds,
    )

    return SettingsResponse(
        auto_logout_seconds=row.auto_logout_seconds,
        jwt_expire_seconds=row.jwt_expire_seconds,
        jwt_refresh_interval_seconds=row.jwt_refresh_interval_seconds,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


# ═══════════════════════════════════════════════════
# 앱 관리
# ═══════════════════════════════════════════════════

@router.get("/apps", response_model=PaginatedResponse[AppItem])
async def list_apps(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(App).order_by(App.sort_order, App.name)
    count_query = select(func.count(App.id))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    pages_count = math.ceil(total / size) if total > 0 else 1
    result = await db.execute(query.offset((page - 1) * size).limit(size))
    apps = result.scalars().all()
    return PaginatedResponse[AppItem](
        items=[AppItem.model_validate(a) for a in apps],
        total=total, page=page, size=size, pages=pages_count,
    )


@router.post("/apps", response_model=AppItem, status_code=201)
async def create_app(
    body: AppCreateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(App).where(App.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 존재하는 슬러그입니다")
    max_order_result = await db.execute(select(func.coalesce(func.max(App.sort_order), -1)))
    max_order = max_order_result.scalar() or 0
    app = App(
        name=body.name, slug=body.slug, description=body.description,
        icon=body.icon, path=body.path, color=body.color,
        admin_path=body.admin_path, open_in_new_tab=body.open_in_new_tab,
        sort_order=max_order + 1,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return AppItem.model_validate(app)


@router.put("/apps/{app_id}", response_model=AppItem)
async def update_app(
    app_id: int,
    body: AppUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    app = result.scalar_one_or_none()
    if app is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    if body.slug is not None:
        dup = await db.execute(select(App).where(App.slug == body.slug, App.id != app_id))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="이미 존재하는 슬러그입니다")
        app.slug = body.slug
    if body.name is not None: app.name = body.name
    if body.description is not None: app.description = body.description or None
    if body.icon is not None: app.icon = body.icon
    if body.path is not None: app.path = body.path
    if body.color is not None: app.color = body.color
    if body.admin_path is not None: app.admin_path = body.admin_path or None
    if body.open_in_new_tab is not None: app.open_in_new_tab = body.open_in_new_tab
    if body.is_active is not None: app.is_active = body.is_active
    if body.sort_order is not None: app.sort_order = body.sort_order
    app.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(app)
    return AppItem.model_validate(app)


@router.delete("/apps/{app_id}", response_model=MessageResponse)
async def delete_app(
    app_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    app = result.scalar_one_or_none()
    if app is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    await db.delete(app)
    await db.commit()
    return MessageResponse(message="앱이 삭제되었습니다")


@router.get("/apps/{app_id}/groups", response_model=AppGroupAccessResponse)
async def get_app_groups(
    app_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    access_result = await db.execute(
        select(AppGroupAccess).where(AppGroupAccess.app_id == app_id)
    )
    group_ids = [row.group_id for row in access_result.scalars().all()]
    return AppGroupAccessResponse(app_id=app_id, group_ids=group_ids)


@router.put("/apps/{app_id}/groups", response_model=AppGroupAccessResponse)
async def set_app_groups(
    app_id: int,
    body: AppGroupAccessUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    # Delete all existing entries for this app
    existing = await db.execute(
        select(AppGroupAccess).where(AppGroupAccess.app_id == app_id)
    )
    for row in existing.scalars().all():
        await db.delete(row)
    # Insert new entries
    for group_id in body.group_ids:
        db.add(AppGroupAccess(app_id=app_id, group_id=group_id))
    await db.commit()
    return AppGroupAccessResponse(app_id=app_id, group_ids=body.group_ids)


@router.get("/apps/{app_id}/users", response_model=AppUserAccessResponse)
async def get_app_users(
    app_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    access_result = await db.execute(
        select(AppUserAccess).where(AppUserAccess.app_id == app_id)
    )
    user_ids = [row.user_id for row in access_result.scalars().all()]
    return AppUserAccessResponse(app_id=app_id, user_ids=user_ids)


@router.put("/apps/{app_id}/users", response_model=AppUserAccessResponse)
async def set_app_users(
    app_id: int,
    body: AppUserAccessUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    # Delete all existing entries for this app
    existing = await db.execute(
        select(AppUserAccess).where(AppUserAccess.app_id == app_id)
    )
    for row in existing.scalars().all():
        await db.delete(row)
    # Insert new entries
    for user_id in body.user_ids:
        db.add(AppUserAccess(app_id=app_id, user_id=user_id))
    await db.commit()
    return AppUserAccessResponse(app_id=app_id, user_ids=body.user_ids)


# ═══════════════════════════════════════════════════
# 역할 관리
# ═══════════════════════════════════════════════════

@router.get("/roles", response_model=PaginatedResponse[RoleItem])
async def list_roles(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count(Role.id)))
    total = count_result.scalar() or 0
    pages_count = math.ceil(total / size) if total > 0 else 1
    result = await db.execute(
        select(Role).order_by(Role.sort_order, Role.name)
        .offset((page - 1) * size).limit(size)
    )
    roles = result.scalars().all()
    return PaginatedResponse[RoleItem](
        items=[RoleItem.model_validate(r) for r in roles],
        total=total, page=page, size=size, pages=pages_count,
    )


@router.post("/roles", response_model=RoleItem, status_code=201)
async def create_role(
    body: RoleCreateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Role).where(Role.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 존재하는 역할명입니다")
    max_order_result = await db.execute(select(func.coalesce(func.max(Role.sort_order), -1)))
    max_order = max_order_result.scalar() or 0
    role = Role(name=body.name, description=body.description, sort_order=max_order + 1)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return RoleItem.model_validate(role)


@router.put("/roles/{role_id}", response_model=RoleItem)
async def update_role(
    role_id: int,
    body: RoleUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="역할을 찾을 수 없습니다")
    if body.name is not None:
        dup = await db.execute(select(Role).where(Role.name == body.name, Role.id != role_id))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="이미 존재하는 역할명입니다")
        role.name = body.name
    if body.description is not None: role.description = body.description or None
    if body.is_active is not None: role.is_active = body.is_active
    if body.sort_order is not None: role.sort_order = body.sort_order
    role.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(role)
    return RoleItem.model_validate(role)


@router.delete("/roles/{role_id}", response_model=MessageResponse)
async def delete_role(
    role_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="역할을 찾을 수 없습니다")
    await db.delete(role)
    await db.commit()
    return MessageResponse(message="역할이 삭제되었습니다")


@router.post("/roles/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_roles(
    body: BulkDeleteRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    deleted = []
    failed = []
    for rid in body.ids:
        result = await db.execute(select(Role).where(Role.id == rid))
        role = result.scalar_one_or_none()
        if role is None:
            failed.append(BulkDeleteFailure(id=rid, reason="역할을 찾을 수 없습니다"))
            continue
        await db.delete(role)
        deleted.append(rid)
    await db.commit()
    return BulkDeleteResponse(deleted=deleted, failed=failed)


# ═══════════════════════════════════════════════════
# 직위 관리
# ═══════════════════════════════════════════════════

@router.get("/positions", response_model=PaginatedResponse[PositionItem])
async def list_positions(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count(Position.id)))
    total = count_result.scalar() or 0
    pages_count = math.ceil(total / size) if total > 0 else 1
    result = await db.execute(
        select(Position).order_by(Position.sort_order, Position.name)
        .offset((page - 1) * size).limit(size)
    )
    positions = result.scalars().all()
    items = []
    for p in positions:
        uc_result = await db.execute(
            select(func.count(User.id)).where(User.position_id == p.id)
        )
        user_count = uc_result.scalar() or 0
        items.append(PositionItem(
            id=p.id, name=p.name, description=p.description,
            is_active=p.is_active, sort_order=p.sort_order,
            user_count=user_count,
            created_at=p.created_at, updated_at=p.updated_at,
        ))
    return PaginatedResponse[PositionItem](
        items=items, total=total, page=page, size=size, pages=pages_count,
    )


@router.post("/positions", response_model=PositionItem, status_code=201)
async def create_position(
    body: PositionCreateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Position).where(Position.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 존재하는 직위명입니다")
    max_order_result = await db.execute(select(func.coalesce(func.max(Position.sort_order), -1)))
    max_order = max_order_result.scalar() or 0
    position = Position(name=body.name, description=body.description, sort_order=max_order + 1)
    db.add(position)
    await db.commit()
    await db.refresh(position)
    return PositionItem(
        id=position.id, name=position.name, description=position.description,
        is_active=position.is_active, sort_order=position.sort_order,
        user_count=0, created_at=position.created_at, updated_at=position.updated_at,
    )


@router.put("/positions/{position_id}", response_model=PositionItem)
async def update_position(
    position_id: int,
    body: PositionUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()
    if position is None:
        raise HTTPException(status_code=404, detail="직위를 찾을 수 없습니다")
    if body.name is not None:
        dup = await db.execute(select(Position).where(Position.name == body.name, Position.id != position_id))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="이미 존재하는 직위명입니다")
        position.name = body.name
    if body.description is not None: position.description = body.description or None
    if body.is_active is not None: position.is_active = body.is_active
    if body.sort_order is not None: position.sort_order = body.sort_order
    position.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(position)
    uc_result = await db.execute(
        select(func.count(User.id)).where(User.position_id == position.id)
    )
    user_count = uc_result.scalar() or 0
    return PositionItem(
        id=position.id, name=position.name, description=position.description,
        is_active=position.is_active, sort_order=position.sort_order,
        user_count=user_count, created_at=position.created_at, updated_at=position.updated_at,
    )


@router.delete("/positions/{position_id}", response_model=MessageResponse)
async def delete_position(
    position_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()
    if position is None:
        raise HTTPException(status_code=404, detail="직위를 찾을 수 없습니다")
    uc_result = await db.execute(
        select(func.count(User.id)).where(User.position_id == position.id)
    )
    if (uc_result.scalar() or 0) > 0:
        raise HTTPException(status_code=409, detail="소속 사용자가 있는 직위는 삭제할 수 없습니다")
    await db.delete(position)
    await db.commit()
    return MessageResponse(message="직위가 삭제되었습니다")


@router.post("/positions/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_positions(
    body: BulkDeleteRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    deleted = []
    failed = []
    for pid in body.ids:
        result = await db.execute(select(Position).where(Position.id == pid))
        position = result.scalar_one_or_none()
        if position is None:
            failed.append(BulkDeleteFailure(id=pid, reason="직위를 찾을 수 없습니다"))
            continue
        uc_result = await db.execute(
            select(func.count(User.id)).where(User.position_id == position.id)
        )
        if (uc_result.scalar() or 0) > 0:
            failed.append(BulkDeleteFailure(id=pid, reason=f"'{position.name}' 직위에 소속 사용자가 있어 삭제할 수 없습니다"))
            continue
        await db.delete(position)
        deleted.append(pid)
    await db.commit()
    return BulkDeleteResponse(deleted=deleted, failed=failed)


# ═══════════════════════════════════════════════════
# 앱 기능 관리
# ═══════════════════════════════════════════════════

@router.get("/apps/{app_id}/features", response_model=list[AppFeatureItem])
async def list_app_features(
    app_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    features_result = await db.execute(
        select(AppFeature)
        .where(AppFeature.app_id == app_id)
        .order_by(AppFeature.sort_order, AppFeature.name)
    )
    features = features_result.scalars().all()
    return [AppFeatureItem.model_validate(f) for f in features]


@router.post("/apps/{app_id}/features", response_model=AppFeatureItem, status_code=201)
async def create_app_feature(
    app_id: int,
    body: AppFeatureCreateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(App).where(App.id == app_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")
    dup = await db.execute(
        select(AppFeature).where(AppFeature.app_id == app_id, AppFeature.slug == body.slug)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 존재하는 기능 슬러그입니다")
    feature = AppFeature(
        app_id=app_id,
        name=body.name,
        slug=body.slug,
        icon=body.icon,
        description=body.description,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    db.add(feature)
    await db.commit()
    await db.refresh(feature)
    return AppFeatureItem.model_validate(feature)


@router.put("/apps/{app_id}/features/{feature_id}", response_model=AppFeatureItem)
async def update_app_feature(
    app_id: int,
    feature_id: int,
    body: AppFeatureUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AppFeature).where(AppFeature.id == feature_id, AppFeature.app_id == app_id)
    )
    feature = result.scalar_one_or_none()
    if feature is None:
        raise HTTPException(status_code=404, detail="기능을 찾을 수 없습니다")
    if body.slug is not None:
        dup = await db.execute(
            select(AppFeature).where(
                AppFeature.app_id == app_id,
                AppFeature.slug == body.slug,
                AppFeature.id != feature_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="이미 존재하는 기능 슬러그입니다")
        feature.slug = body.slug
    if body.name is not None:
        feature.name = body.name
    if body.icon is not None:
        feature.icon = body.icon or None
    if body.description is not None:
        feature.description = body.description or None
    if body.sort_order is not None:
        feature.sort_order = body.sort_order
    if body.is_active is not None:
        feature.is_active = body.is_active
    await db.commit()
    await db.refresh(feature)
    return AppFeatureItem.model_validate(feature)


@router.delete("/apps/{app_id}/features/{feature_id}", response_model=MessageResponse)
async def delete_app_feature(
    app_id: int,
    feature_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AppFeature).where(AppFeature.id == feature_id, AppFeature.app_id == app_id)
    )
    feature = result.scalar_one_or_none()
    if feature is None:
        raise HTTPException(status_code=404, detail="기능을 찾을 수 없습니다")
    await db.delete(feature)
    await db.commit()
    return MessageResponse(message="기능이 삭제되었습니다")


@router.get("/apps/{app_id}/features/{feature_id}/access", response_model=AppFeatureAccessResponse)
async def get_app_feature_access(
    app_id: int,
    feature_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AppFeature).where(AppFeature.id == feature_id, AppFeature.app_id == app_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="기능을 찾을 수 없습니다")
    access_result = await db.execute(
        select(AppFeatureAccess).where(AppFeatureAccess.feature_id == feature_id)
    )
    rows = access_result.scalars().all()
    return AppFeatureAccessResponse(
        feature_id=feature_id,
        group_ids=[r.group_id for r in rows if r.group_id is not None],
        user_ids=[r.user_id for r in rows if r.user_id is not None],
        role_ids=[r.role_id for r in rows if r.role_id is not None],
        position_ids=[r.position_id for r in rows if r.position_id is not None],
    )


@router.put("/apps/{app_id}/features/{feature_id}/access", response_model=AppFeatureAccessResponse)
async def set_app_feature_access(
    app_id: int,
    feature_id: int,
    body: AppFeatureAccessUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AppFeature).where(AppFeature.id == feature_id, AppFeature.app_id == app_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="기능을 찾을 수 없습니다")
    # Delete all existing access rows for this feature
    existing = await db.execute(
        select(AppFeatureAccess).where(AppFeatureAccess.feature_id == feature_id)
    )
    for row in existing.scalars().all():
        await db.delete(row)
    # Insert new entries
    for group_id in body.group_ids:
        db.add(AppFeatureAccess(feature_id=feature_id, group_id=group_id))
    for user_id in body.user_ids:
        db.add(AppFeatureAccess(feature_id=feature_id, user_id=user_id))
    for role_id in body.role_ids:
        db.add(AppFeatureAccess(feature_id=feature_id, role_id=role_id))
    for position_id in body.position_ids:
        db.add(AppFeatureAccess(feature_id=feature_id, position_id=position_id))
    await db.commit()
    return AppFeatureAccessResponse(
        feature_id=feature_id,
        group_ids=body.group_ids,
        user_ids=body.user_ids,
        role_ids=body.role_ids,
        position_ids=body.position_ids,
    )
