import os
import glob as glob_mod
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, Response, Cookie, File, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import Group, Role, User, UserAppOrder, App, AppGroupAccess, AppUserAccess, AppFeature, AppFeatureAccess
from app.schemas import (
    LoginRequest, LoginResponse, UserInfo, MeResponse, ClientSettings,
    MessageResponse, AppOrderResponse, AppOrderUpdateRequest,
    ProfileUpdateRequest, PublicAppItem,
)
from app.services.auth_service import verify_password, hash_password, create_jwt, verify_jwt
from app.services.settings_service import settings_cache
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter()

AVATAR_DIR = "/app/data/avatars"

# SSO 로그인 실패 messageKey → HTTP 상태 코드
_SSO_ERROR_STATUS = {
    "ACCOUNT_DISABLED": status.HTTP_403_FORBIDDEN,
    "ACCOUNT_LOCKED":   status.HTTP_403_FORBIDDEN,
}
# 사용자에게 노출하는 오류 메시지 (계정 존재 여부 노출 방지)
_SSO_ERROR_MSG = {
    "ACCOUNT_DISABLED": "비활성화된 계정입니다. 관리자에게 문의하세요.",
    "ACCOUNT_LOCKED":   "로그인 실패가 여러 번 반복되어 계정이 잠겼습니다.",
}
_DEFAULT_AUTH_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다."


def _set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
        domain=settings.COOKIE_DOMAIN or None,
        max_age=settings_cache.jwt_expire_seconds,
    )


async def _find_or_create_group(db: AsyncSession, dept_id: int | None, dept_name: str | None) -> int:
    """SSO departmentId → 로컬 group_id 매핑. 없으면 자동 생성."""
    if dept_id is not None:
        result = await db.execute(select(Group).where(Group.sso_dept_id == dept_id))
        group = result.scalar_one_or_none()
        if group:
            return group.id
        # 신규 그룹 생성
        group = Group(
            name=dept_name or f"부서-{dept_id}",
            sso_dept_id=dept_id,
            is_active=True,
        )
        db.add(group)
        await db.flush()
        return group.id

    # dept_id가 없으면 미배정 (관리자가 수동으로 지정)
    return None


async def _get_default_role_id(db: AsyncSession) -> int:
    """SSO 자동 프로비저닝 사용자의 기본 role_id (role name='user')."""
    result = await db.execute(
        select(Role).where(Role.name == "user", Role.is_active == True)
    )
    role = result.scalar_one_or_none()
    if role:
        return role.id
    # fallback: admin이 아닌 첫 번째 role
    result = await db.execute(
        select(Role).where(Role.name != "admin", Role.is_active == True).order_by(Role.sort_order)
    )
    role = result.scalar_one_or_none()
    return role.id if role else 1001


async def _find_or_create_sso_user(db: AsyncSession, sso) -> User:
    """SSO 로그인 성공 후 로컬 User 레코드를 찾거나 자동 생성한다."""
    # 1) sso_user_id로 찾기
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.custom_role))
        .where(User.sso_user_id == sso.user_id)
    )
    user = result.scalar_one_or_none()
    if user:
        # 이름/이메일 최신 정보로 갱신
        if sso.name and user.display_name != sso.name:
            user.display_name = sso.name
        if sso.email and user.email != sso.email:
            user.email = sso.email
        return user

    # 2) username(loginId)으로 찾기 — 수동으로 미리 생성된 계정 연결
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.custom_role))
        .where(User.username == sso.login_id)
    )
    user = result.scalar_one_or_none()
    if user:
        user.sso_user_id = sso.user_id
        user.password_hash = None   # 로컬 비밀번호 제거, SSO로 전환
        if sso.name:
            user.display_name = sso.name
        if sso.email:
            user.email = sso.email
        return user

    # 3) 자동 프로비저닝 — 신규 사용자 생성
    group_id = await _find_or_create_group(db, sso.primary_dept_id, sso.primary_dept_name)
    role_id = await _get_default_role_id(db)
    user = User(
        username=sso.login_id,
        password_hash=None,
        display_name=sso.name or sso.login_id,
        email=sso.email,
        sso_user_id=sso.user_id,
        group_id=group_id,
        role_id=role_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()  # PK 채번

    # relationship 로드
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.custom_role))
        .where(User.id == user.id)
    )
    return result.scalar_one()


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # ── 1. 로컬 사용자 조회 ────────────────────────────────────────────
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.custom_role))
        .where(User.username == body.username)
    )
    user = result.scalar_one_or_none()

    # ── 2. 인증 방식 결정 ──────────────────────────────────────────────
    if user is not None and user.password_hash is not None:
        # ── 로컬 인증 (admin / system 등 password_hash 보유 계정) ──
        if not user.is_active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "비활성화된 계정입니다. 관리자에게 문의하세요.")
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, _DEFAULT_AUTH_ERROR)
    else:
        # ── SSO 인증 ────────────────────────────────────────────────
        if not settings.sso_enabled:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, _DEFAULT_AUTH_ERROR)

        from app.sso_client import sso_client
        sso_result = await sso_client.login(body.username, body.password)

        if not sso_result.success:
            http_code = _SSO_ERROR_STATUS.get(sso_result.error_key, status.HTTP_401_UNAUTHORIZED)
            msg = _SSO_ERROR_MSG.get(sso_result.error_key, _DEFAULT_AUTH_ERROR)
            raise HTTPException(http_code, msg)

        user = await _find_or_create_sso_user(db, sso_result)

        if not user.is_active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "비활성화된 계정입니다. 관리자에게 문의하세요.")

    # ── 3. JWT 발급 ────────────────────────────────────────────────────
    role_name = user.custom_role.name if user.custom_role else "user"
    token = create_jwt(
        user_id=user.id, username=user.username, role=role_name,
        group_id=user.group_id, expire_seconds=settings_cache.jwt_expire_seconds,
        display_name=user.display_name,
        group_name=user.group.name if user.group else "",
    )
    _set_access_cookie(response, token)
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    return LoginResponse(
        message="로그인 성공",
        user=UserInfo(
            id=user.id, username=user.username, display_name=user.display_name,
            role=role_name, group_id=user.group_id,
            group_name=user.group.name if user.group else "",
        ),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/", domain=settings.COOKIE_DOMAIN or None)
    return MessageResponse(message="로그아웃 성공")


@router.get("/verify-apikey")
async def verify_apikey(x_api_key: str | None = Header(default=None, alias="X-Api-Key")):
    """DevOps 시스템 등 외부 서버에서 X-Api-Key 헤더로 인증하는 엔드포인트."""
    if not settings.DEVOPS_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API Key 인증이 설정되지 않았습니다")
    if not x_api_key or x_api_key != settings.DEVOPS_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 API Key입니다")
    from urllib.parse import quote
    response = Response(status_code=200)
    response.headers["X-User-Id"]         = "0"
    response.headers["X-User-Role"]       = "admin"
    response.headers["X-User-Username"]   = "devops_system"
    response.headers["X-User-Group-Id"]   = "0"
    response.headers["X-User-Group-Name"] = quote("DevOps")
    response.headers["X-Display-Name"]    = quote("DevOps System")
    return response


@router.get("/verify")
async def verify(access_token: str | None = Cookie(default=None)):
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    payload = verify_jwt(access_token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    from urllib.parse import quote
    response = Response(status_code=200)
    response.headers["X-User-Id"] = str(payload.get("sub", ""))
    response.headers["X-User-Role"] = str(payload.get("role", ""))
    response.headers["X-User-Username"] = str(payload.get("username", ""))
    response.headers["X-User-Group-Id"] = str(payload.get("group_id", ""))
    response.headers["X-User-Group-Name"] = quote(str(payload.get("group_name", "")))
    display_name = str(payload.get("display_name", payload.get("username", "")))
    response.headers["X-Display-Name"] = quote(display_name)
    return response


@router.get("/me", response_model=MeResponse)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(joinedload(User.group), joinedload(User.position), joinedload(User.custom_role))
        .where(User.id == current_user.id)
    )
    user = result.scalar_one()
    role_name = user.custom_role.name if user.custom_role else "user"
    return MeResponse(
        id=user.id, username=user.username, display_name=user.display_name,
        email=user.email, role=role_name, group_id=user.group_id,
        group_name=user.group.name if user.group else "",
        position_id=user.position_id,
        position_name=user.position.name if user.position else None,
        role_id=user.role_id,
        role_name=role_name,
        avatar_path=user.avatar_path,
        last_login_at=user.last_login_at, created_at=user.created_at,
        settings=ClientSettings(
            auto_logout_seconds=settings_cache.auto_logout_seconds,
            jwt_refresh_interval_seconds=settings_cache.jwt_refresh_interval_seconds,
        ),
    )


@router.post("/refresh", response_model=MessageResponse)
async def refresh(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="비활성화된 계정입니다")
    token = create_jwt(
        user_id=current_user.id, username=current_user.username,
        role=current_user.custom_role.name if current_user.custom_role else "user",
        group_id=current_user.group_id,
        expire_seconds=settings_cache.jwt_expire_seconds,
        display_name=current_user.display_name,
        group_name=current_user.group.name if current_user.group else "",
    )
    _set_access_cookie(response, token)
    return MessageResponse(message="토큰 갱신 성공")


# ─── App Order ────────────────────────────────────────

@router.get("/app-order", response_model=AppOrderResponse)
async def get_app_order(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserAppOrder).where(UserAppOrder.user_id == current_user.id))
    order = result.scalar_one_or_none()
    return AppOrderResponse(app_order=order.app_order if order else [])


@router.put("/app-order", response_model=AppOrderResponse)
async def update_app_order(
    body: AppOrderUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserAppOrder).where(UserAppOrder.user_id == current_user.id))
    order = result.scalar_one_or_none()
    if order:
        order.app_order = body.app_order
    else:
        order = UserAppOrder(user_id=current_user.id, app_order=body.app_order)
        db.add(order)
    await db.commit()
    return AppOrderResponse(app_order=body.app_order)


# ─── Profile ─────────────────────────────────────

@router.put("/profile", response_model=MessageResponse)
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.new_password:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="현재 비밀번호를 입력하세요")

        if current_user.password_hash is None:
            # SSO 사용자 — 비밀번호 변경을 SSO에 위임
            from app.sso_client import sso_client
            if not settings.sso_enabled:
                raise HTTPException(status_code=400, detail="SSO가 설정되지 않아 비밀번호를 변경할 수 없습니다.")
            try:
                await sso_client.change_password(
                    current_user.username, body.current_password, body.new_password
                )
            except RuntimeError as e:
                _pw_error_map = {
                    "INVALID_CREDENTIALS":      "현재 비밀번호가 올바르지 않습니다.",
                    "PASSWORD_TOO_SHORT":        "비밀번호가 너무 짧습니다.",
                    "PASSWORD_REQUIRE_UPPER":    "대문자를 포함해야 합니다.",
                    "PASSWORD_REQUIRE_NUMBER":   "숫자를 포함해야 합니다.",
                    "PASSWORD_REQUIRE_SPECIAL":  "특수문자를 포함해야 합니다.",
                    "PASSWORD_REUSED":           "최근에 사용한 비밀번호는 재사용할 수 없습니다.",
                }
                msg = _pw_error_map.get(str(e), str(e))
                raise HTTPException(status_code=400, detail=msg)
        else:
            # 로컬 인증 사용자
            if not verify_password(body.current_password, current_user.password_hash):
                raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다")
            current_user.password_hash = hash_password(body.new_password)

    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.email is not None:
        current_user.email = body.email or None

    await db.commit()
    return MessageResponse(message="프로필이 수정되었습니다")


# ─── Avatar ──────────────────────────────────────

@router.post("/me/avatar", response_model=MessageResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="파일 크기는 2MB 이하여야 합니다")

    ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}
    ext = ext_map.get(file.content_type, "jpg")

    # Delete old avatar
    for old in glob_mod.glob(os.path.join(AVATAR_DIR, f"{current_user.id}.*")):
        os.remove(old)

    os.makedirs(AVATAR_DIR, exist_ok=True)
    filename = f"{current_user.id}.{ext}"
    filepath = os.path.join(AVATAR_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    current_user.avatar_path = filename
    await db.commit()
    return MessageResponse(message="아바타가 업로드되었습니다")


@router.delete("/me/avatar", response_model=MessageResponse)
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for old in glob_mod.glob(os.path.join(AVATAR_DIR, f"{current_user.id}.*")):
        os.remove(old)
    current_user.avatar_path = None
    await db.commit()
    return MessageResponse(message="아바타가 삭제되었습니다")


@router.get("/my-features/{app_slug}", response_model=list[str])
async def get_my_features(
    app_slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns a list of feature slugs the current user can access for the given app.
    - Admin users get all features.
    - If a feature has no access records, it is open to everyone.
    - If a feature has access records, the user must match at least one (group, user, role, position).
    """
    # Resolve the app
    app_result = await db.execute(select(App).where(App.slug == app_slug, App.is_active == True))
    app = app_result.scalar_one_or_none()
    if app is None:
        raise HTTPException(status_code=404, detail="앱을 찾을 수 없습니다")

    # Load active features for this app
    features_result = await db.execute(
        select(AppFeature)
        .where(AppFeature.app_id == app.id, AppFeature.is_active == True)
        .order_by(AppFeature.sort_order, AppFeature.name)
    )
    features = features_result.scalars().all()

    # Admin users always get all features
    if current_user.custom_role and current_user.custom_role.name == "admin":
        return [f.slug for f in features]

    allowed_slugs: list[str] = []
    for feature in features:
        access_result = await db.execute(
            select(AppFeatureAccess).where(AppFeatureAccess.feature_id == feature.id)
        )
        access_rows = access_result.scalars().all()

        if not access_rows:
            # No restrictions — open to everyone
            allowed_slugs.append(feature.slug)
        else:
            # Check if user matches any access rule
            for row in access_rows:
                if row.group_id is not None and row.group_id == current_user.group_id:
                    allowed_slugs.append(feature.slug)
                    break
                if row.user_id is not None and row.user_id == current_user.id:
                    allowed_slugs.append(feature.slug)
                    break
                if row.role_id is not None and row.role_id == current_user.role_id:
                    allowed_slugs.append(feature.slug)
                    break
                if row.position_id is not None and row.position_id == current_user.position_id:
                    allowed_slugs.append(feature.slug)
                    break

    return allowed_slugs


@router.get("/avatar/{user_id}")
async def get_avatar(user_id: int):
    matches = glob_mod.glob(os.path.join(AVATAR_DIR, f"{user_id}.*"))
    if matches:
        return FileResponse(matches[0])
    raise HTTPException(status_code=404, detail="아바타를 찾을 수 없습니다")


# ─── Public Apps List ─────────────────────────────

@router.get("/apps", response_model=list[PublicAppItem])
async def list_public_apps(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(App).where(App.is_active == True).order_by(App.sort_order, App.name)
    )
    apps = result.scalars().all()

    # For each app: visible if no restrictions at all, or user's group is allowed, or user is individually allowed
    allowed = []
    for app in apps:
        group_rows_result = await db.execute(
            select(AppGroupAccess).where(AppGroupAccess.app_id == app.id)
        )
        group_rows = group_rows_result.scalars().all()

        user_rows_result = await db.execute(
            select(AppUserAccess).where(AppUserAccess.app_id == app.id)
        )
        user_rows = user_rows_result.scalars().all()

        if not group_rows and not user_rows:
            # No restrictions — visible to all
            allowed.append(app)
        else:
            allowed_group_ids = {row.group_id for row in group_rows}
            allowed_user_ids = {row.user_id for row in user_rows}
            if current_user.group_id in allowed_group_ids or current_user.id in allowed_user_ids:
                allowed.append(app)

    return [
        PublicAppItem(
            id=app.slug,
            name=app.name,
            description=app.description or "",
            icon=app.icon,
            path=app.path,
            color=app.color,
            open_in_new_tab=app.open_in_new_tab,
        )
        for app in allowed
    ]
