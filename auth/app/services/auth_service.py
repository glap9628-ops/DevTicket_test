from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.hash import bcrypt
from app.config import settings


def hash_password(password: str) -> str:
    """비밀번호를 bcrypt 해시로 변환한다."""
    return bcrypt.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """비밀번호를 bcrypt 해시와 비교한다."""
    try:
        return bcrypt.verify(password, password_hash)
    except Exception:
        return False


def create_jwt(
    user_id: int,
    username: str,
    role: str,
    group_id: int,
    expire_seconds: int,
    display_name: str = "",
    group_name: str = "",
) -> str:
    """JWT 토큰을 생성한다."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "display_name": display_name or username,
        "role": role,
        "group_id": group_id,
        "group_name": group_name,
        "exp": now + timedelta(seconds=expire_seconds),
        "iat": now,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_jwt(token: str) -> dict | None:
    """JWT 토큰을 검증하고 페이로드를 반환한다. 유효하지 않으면 None."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
