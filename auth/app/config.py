from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    COOKIE_SECURE: bool = False
    COOKIE_DOMAIN: str = ""
    CORS_ORIGINS: str = "http://localhost:3000"

    # ── SSO 연동 ─────────────────────────────────────────────────────────
    SSO_BASE_URL: str = ""          # 예: http://192.168.13.10
    SSO_CLIENT_ID: str = ""         # CID
    SSO_CLIENT_SECRET: str = ""     # Skey

    # ── 외부 시스템 연동 API Key ──────────────────────────────────────────
    DEVOPS_API_KEY: str = ""        # DevOps 장애이슈 연동용 (비어있으면 API Key 인증 비활성)

    @property
    def sso_enabled(self) -> bool:
        return bool(self.SSO_BASE_URL and self.SSO_CLIENT_ID and self.SSO_CLIENT_SECRET)

    class Config:
        env_file = ".env"


settings = Settings()
