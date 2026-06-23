from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import async_session
from app.services.settings_service import settings_cache
from app.routers import auth, admin, notifications


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: DB에서 시스템 설정 캐시 로드
    async with async_session() as db:
        await settings_cache.load_from_db(db)

    # SSO 클라이언트 초기화
    from app.sso_client import init_sso_client
    init_sso_client(settings.SSO_BASE_URL, settings.SSO_CLIENT_ID, settings.SSO_CLIENT_SECRET)

    yield
    # Shutdown: 정리 작업 (필요 시)


app = FastAPI(
    title="Innotium Auth Service",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
if "*" in origins:
    raise ValueError("CORS_ORIGINS에 '*'을 사용할 수 없습니다. 구체적인 오리진을 지정하세요.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(notifications.router, prefix="/api/auth", tags=["notifications"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
