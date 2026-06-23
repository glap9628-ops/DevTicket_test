import math
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload
from app.models import Group, User


async def get_groups_paginated(
    db: AsyncSession,
    page: int = 1,
    size: int = 20,
    search: str | None = None,
    is_active: bool | None = None,
) -> tuple[list[dict], int]:
    """그룹 목록 조회 (페이지네이션, 검색, 필터)."""
    conditions = []
    if search:
        conditions.append(Group.name.ilike(f"%{search}%"))
    if is_active is not None:
        conditions.append(Group.is_active == is_active)

    # 총 개수
    count_q = select(func.count(Group.id))
    if conditions:
        count_q = count_q.where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    # 데이터 조회
    q = select(Group).order_by(Group.name)
    if conditions:
        q = q.where(and_(*conditions))
    q = q.offset((page - 1) * size).limit(size)
    result = await db.execute(q)
    groups = result.scalars().all()

    # user_count 서브쿼리
    items = []
    for g in groups:
        uc_result = await db.execute(
            select(func.count(User.id)).where(User.group_id == g.id)
        )
        user_count = uc_result.scalar() or 0
        items.append({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "is_active": g.is_active,
            "user_count": user_count,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
        })

    return items, total


async def get_group_by_id(db: AsyncSession, group_id: int) -> Group | None:
    """그룹 단건 조회."""
    result = await db.execute(select(Group).where(Group.id == group_id))
    return result.scalar_one_or_none()


async def get_group_detail(db: AsyncSession, group_id: int) -> dict | None:
    """그룹 상세 조회 (소속 사용자 포함)."""
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.users).joinedload(User.custom_role))
        .where(Group.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        return None

    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "is_active": group.is_active,
        "user_count": len(group.users),
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "role": u.custom_role.name if u.custom_role else "user",
                "is_active": u.is_active,
            }
            for u in group.users
        ],
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


async def create_group(db: AsyncSession, name: str, description: str | None) -> Group:
    """그룹 생성."""
    group = Group(name=name, description=description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


async def update_group(
    db: AsyncSession,
    group: Group,
    name: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> Group:
    """그룹 수정."""
    if name is not None:
        group.name = name
    if description is not None:
        group.description = description
    if is_active is not None:
        group.is_active = is_active
    await db.commit()
    await db.refresh(group)
    return group


async def delete_group(db: AsyncSession, group: Group) -> None:
    """그룹 삭제."""
    await db.delete(group)
    await db.commit()


async def group_has_users(db: AsyncSession, group_id: int) -> bool:
    """그룹에 소속된 사용자가 있는지 확인."""
    result = await db.execute(
        select(func.count(User.id)).where(User.group_id == group_id)
    )
    return (result.scalar() or 0) > 0


async def group_name_exists(db: AsyncSession, name: str, exclude_id: int | None = None) -> bool:
    """그룹명 중복 확인."""
    q = select(Group).where(Group.name == name)
    if exclude_id is not None:
        q = q.where(Group.id != exclude_id)
    result = await db.execute(q)
    return result.scalar_one_or_none() is not None
