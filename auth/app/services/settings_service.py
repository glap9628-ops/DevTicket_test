import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import SystemSettings


class SettingsCache:
    """시스템 설정 메모리 캐시. 싱글턴으로 관리한다."""

    _instance = None
    _lock = asyncio.Lock()

    def __init__(self):
        self.auto_logout_seconds: int = 1800
        self.jwt_expire_seconds: int = 3600
        self.jwt_refresh_interval_seconds: int = 600

    @classmethod
    def get_instance(cls) -> "SettingsCache":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def load_from_db(self, db: AsyncSession):
        """DB에서 설정을 로드하여 캐시를 갱신한다."""
        async with self._lock:
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.id == 1)
            )
            row = result.scalar_one_or_none()
            if row:
                self.auto_logout_seconds = row.auto_logout_seconds
                self.jwt_expire_seconds = row.jwt_expire_seconds
                self.jwt_refresh_interval_seconds = row.jwt_refresh_interval_seconds

    def update(
        self,
        auto_logout: int | None,
        jwt_expire: int | None,
        jwt_refresh: int | None,
    ):
        """캐시를 즉시 갱신한다 (DB 업데이트 후 호출)."""
        if auto_logout is not None:
            self.auto_logout_seconds = auto_logout
        if jwt_expire is not None:
            self.jwt_expire_seconds = jwt_expire
        if jwt_refresh is not None:
            self.jwt_refresh_interval_seconds = jwt_refresh


# 전역 접근
settings_cache = SettingsCache.get_instance()
