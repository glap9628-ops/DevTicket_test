from fastapi import Depends, HTTPException, Cookie, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.database import get_db
from app.services.auth_service import verify_jwt
from app.models import User


async def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """JWT 쿠키에서 현재 사용자를 추출한다. custom_role 관계를 함께 로드한다."""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증이 필요합니다",
        )

    payload = verify_jwt(access_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증이 만료되었거나 유효하지 않습니다",
        )

    user_id = int(payload.get("sub"))
    result = await db.execute(
        select(User)
        .options(joinedload(User.custom_role), joinedload(User.group))
        .where(User.id == user_id, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다",
        )

    return user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """admin 역할을 요구한다."""
    if not current_user.custom_role or current_user.custom_role.name != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다",
        )
    return current_user
