from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models import User, Group, Position, Role
from app.services.auth_service import hash_password


async def get_users_paginated(
    db: AsyncSession,
    page: int = 1,
    size: int = 20,
    search: str | None = None,
    role: str | None = None,
    group_id: int | None = None,
    is_active: bool | None = None,
) -> tuple[list[dict], int]:
    """사용자 목록 조회 (페이지네이션, 검색, 필터)."""
    conditions = []
    if search:
        conditions.append(
            or_(
                User.username.ilike(f"%{search}%"),
                User.display_name.ilike(f"%{search}%"),
            )
        )
    if role:
        # roles 테이블의 name 으로 필터 (서브쿼리)
        conditions.append(
            User.role_id == select(Role.id).where(Role.name == role).scalar_subquery()
        )
    if group_id is not None:
        conditions.append(User.group_id == group_id)
    if is_active is not None:
        conditions.append(User.is_active == is_active)

    # 총 개수
    count_q = select(func.count(User.id))
    if conditions:
        count_q = count_q.where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    # 데이터 조회
    q = (
        select(User)
        .options(joinedload(User.group), joinedload(User.position), joinedload(User.custom_role))
        .order_by(User.display_name, User.id)
    )
    if conditions:
        q = q.where(and_(*conditions))
    q = q.offset((page - 1) * size).limit(size)
    result = await db.execute(q)
    users = result.scalars().unique().all()

    items = []
    for u in users:
        items.append({
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "email": u.email,
            "role": u.custom_role.name if u.custom_role else "user",
            "group_id": u.group_id,
            "group_name": u.group.name if u.group else "",
            "position_id": u.position_id,
            "position_name": u.position.name if u.position else None,
            "role_id": u.role_id,
            "role_name": u.custom_role.name if u.custom_role else None,
            "is_active": u.is_active,
            "avatar_path": u.avatar_path,
            "last_login_at": u.last_login_at,
            "created_at": u.created_at,
            "updated_at": u.updated_at,
        })

    return items, total


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """사용자 단건 조회 (그룹, 직위, 역할 조인)."""
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.position), joinedload(User.custom_role))
        .where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    """username으로 사용자 조회."""
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.position), joinedload(User.custom_role))
        .where(User.username == username)
    )
    return result.scalar_one_or_none()


async def username_exists(db: AsyncSession, username: str, exclude_id: int | None = None) -> bool:
    """username 중복 확인."""
    q = select(User).where(User.username == username)
    if exclude_id is not None:
        q = q.where(User.id != exclude_id)
    result = await db.execute(q)
    return result.scalar_one_or_none() is not None


async def _resolve_role_id(db: AsyncSession, role_name: str) -> int:
    """역할명으로 role_id 를 조회한다. 없으면 ValueError."""
    result = await db.execute(select(Role).where(Role.name == role_name))
    role_obj = result.scalar_one_or_none()
    if role_obj is None:
        raise ValueError(f"Role '{role_name}' not found in roles table")
    return role_obj.id


async def create_user(
    db: AsyncSession,
    username: str,
    password: str,
    display_name: str,
    email: str | None,
    role: str,
    group_id: int,
    position_id: int | None = None,
    role_id: int | None = None,
) -> User:
    """사용자 생성.

    role: 역할명 ("admin" | "user") — role_id 미지정 시 자동 조회.
    role_id: 직접 지정할 경우 role 명 조회를 건너뜀.
    """
    if role_id is None:
        role_id = await _resolve_role_id(db, role)

    user = User(
        username=username,
        password_hash=hash_password(password),
        display_name=display_name,
        email=email,
        group_id=group_id,
        position_id=position_id,
        role_id=role_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    # 그룹/직위/역할 관계 로드
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.position), joinedload(User.custom_role))
        .where(User.id == user.id)
    )
    return result.scalar_one()


async def update_user(
    db: AsyncSession,
    user: User,
    display_name: str | None = None,
    email: str | None = None,
    role: str | None = None,
    group_id: int | None = None,
    position_id: int | None = ...,
    role_id: int | None = ...,
    is_active: bool | None = None,
    password: str | None = None,
) -> User:
    """사용자 수정.

    role: 역할명 변경 시 roles 테이블에서 id 조회 후 role_id 갱신.
    role_id: 직접 role_id 를 지정할 경우 사용 (role 보다 우선).
    """
    if display_name is not None:
        user.display_name = display_name
    if email is not None:
        user.email = email
    if group_id is not None:
        user.group_id = group_id
    if is_active is not None:
        user.is_active = is_active
    if password is not None:
        user.password_hash = hash_password(password)

    # role_id 직접 지정이 우선, 없으면 role 명으로 조회
    if role_id is not ...:
        user.role_id = role_id
    elif role is not None:
        user.role_id = await _resolve_role_id(db, role)

    # position_id: sentinel(...) 이면 변경 없음, None 이면 NULL 로 설정
    if position_id is not ...:
        user.position_id = position_id

    await db.commit()
    await db.refresh(user)
    # 그룹/직위/역할 관계 재로드
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.position), joinedload(User.custom_role))
        .where(User.id == user.id)
    )
    return result.scalar_one()


async def delete_user(db: AsyncSession, user: User) -> None:
    """사용자 삭제."""
    await db.delete(user)
    await db.commit()


async def count_active_admins(db: AsyncSession) -> int:
    """활성 admin 수를 반환한다."""
    result = await db.execute(
        select(func.count(User.id))
        .join(Role, User.role_id == Role.id)
        .where(and_(Role.name == "admin", User.is_active == True))
    )
    return result.scalar() or 0


async def group_is_active(db: AsyncSession, group_id: int) -> bool:
    """그룹이 존재하고 활성 상태인지 확인."""
    result = await db.execute(
        select(Group).where(and_(Group.id == group_id, Group.is_active == True))
    )
    return result.scalar_one_or_none() is not None
