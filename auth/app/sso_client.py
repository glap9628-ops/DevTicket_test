"""
이노티움 SSO 클라이언트 (async httpx 기반)

사용:
    from app.sso_client import sso_client, SsoLoginResult
    result = await sso_client.login("kim", "password")
"""
import asyncio
import base64
import time
from dataclasses import dataclass
from typing import Optional

import httpx


@dataclass
class SsoLoginResult:
    success: bool
    user_id: Optional[int] = None
    login_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    employee_no: Optional[str] = None
    primary_dept_id: Optional[int] = None
    primary_dept_name: Optional[str] = None
    error_key: Optional[str] = None
    http_status: Optional[int] = None


class SsoClient:
    def __init__(self, base_url: str, client_id: str, client_secret: str):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: Optional[str] = None
        self._token_expires_at: float = 0
        self._lock: Optional[asyncio.Lock] = None

    @property
    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    @property
    def enabled(self) -> bool:
        return bool(self.base_url and self.client_id and self.client_secret)

    def _basic_auth_header(self) -> str:
        creds = f"{self.client_id}:{self.client_secret}"
        return "Basic " + base64.b64encode(creds.encode()).decode()

    async def _get_token(self) -> str:
        """JWT 클라이언트 토큰 발급 (만료 60초 전 자동 갱신)"""
        async with self._get_lock:
            if self._token and time.time() < self._token_expires_at:
                return self._token

            async with httpx.AsyncClient(timeout=10.0, verify=False, follow_redirects=True) as client:
                resp = await client.post(
                    f"{self.base_url}/apie/sso/oauth/client-token",
                    headers={"Authorization": self._basic_auth_header()},
                )

            if resp.status_code != 200:
                raise RuntimeError(f"SSO 토큰 발급 실패: HTTP {resp.status_code} / {resp.text}")

            data = resp.json()
            self._token = data["access_token"]
            self._token_expires_at = time.time() + data.get("expires_in", 3600) - 60
            return self._token

    async def login(self, login_id: str, password: str) -> SsoLoginResult:
        """
        SSO 로그인 검증.
        성공: SsoLoginResult(success=True, user_id=..., ...)
        실패: SsoLoginResult(success=False, error_key="INVALID_CREDENTIALS", ...)
        """
        try:
            token = await self._get_token()
            async with httpx.AsyncClient(timeout=10.0, verify=False, follow_redirects=True) as client:
                resp = await client.post(
                    f"{self.base_url}/apie/sso/auth/login",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"loginId": login_id, "password": password},
                )

            if resp.status_code >= 400:
                try:
                    data = resp.json()
                    error_key = data.get("messageKey", "UNKNOWN")
                except Exception:
                    error_key = "UNKNOWN"
                return SsoLoginResult(
                    success=False,
                    error_key=error_key,
                    http_status=resp.status_code,
                )

            data = resp.json()
            dept = data.get("primaryDepartment") or {}
            # login API: userId / sync API: endUserId — 동일 PK
            uid = data.get("userId") or data.get("endUserId")
            return SsoLoginResult(
                success=True,
                user_id=uid,
                login_id=data.get("loginId", login_id),
                name=data.get("name", ""),
                email=data.get("email"),
                employee_no=data.get("employeeNo"),
                primary_dept_id=dept.get("departmentId"),
                primary_dept_name=dept.get("departmentName"),
            )

        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"SSO 통신 오류: {e}") from e

    async def sync_end_users(
        self, since: str | None = None, page: int = 0, page_size: int = 500
    ) -> dict:
        """
        SSO 직원 일괄 동기화.
        반환: { "data": [...], "deletions": [...] }
        """
        token = await self._get_token()
        params: dict = {"page": page, "pageSize": page_size}
        if since:
            params["since"] = since

        async with httpx.AsyncClient(timeout=30.0, verify=False, follow_redirects=True) as client:
            resp = await client.get(
                f"{self.base_url}/apie/sync/end-users",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )

        if resp.status_code >= 400:
            raise RuntimeError(f"SSO 동기화 실패: HTTP {resp.status_code} / {resp.text}")

        return resp.json()

    async def change_password(
        self, login_id: str, current_password: str, new_password: str
    ) -> None:
        """
        SSO 비밀번호 변경.
        실패 시 RuntimeError(messageKey) 발생.
        """
        token = await self._get_token()
        async with httpx.AsyncClient(timeout=10.0, verify=False, follow_redirects=True) as client:
            resp = await client.post(
                f"{self.base_url}/apie/sso/auth/password",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={
                    "loginId": login_id,
                    "currentPassword": current_password,
                    "newPassword": new_password,
                },
            )

        if resp.status_code >= 400:
            try:
                data = resp.json()
                raise RuntimeError(data.get("messageKey", "PASSWORD_CHANGE_FAILED"))
            except RuntimeError:
                raise
            except Exception:
                raise RuntimeError("PASSWORD_CHANGE_FAILED")


# ── 모듈 레벨 싱글턴 (main.py startup 시 init_sso_client() 호출) ──────────
sso_client: Optional[SsoClient] = None


def init_sso_client(base_url: str, client_id: str, client_secret: str) -> None:
    global sso_client
    sso_client = SsoClient(base_url, client_id, client_secret)
