"""
이노티움 SSO 중앙 집중형 인증 클라이언트 (Python 3.9+)

기능:
  - JWT 자동 발급/갱신 (client credentials)
  - 로그인 검증 (/apie/sso/auth/login)
  - 비밀번호 변경 (/apie/sso/auth/password)
  - 사용자·부서 조회

Usage:
    from sso_client import SsoClient, SsoApiError

    sso = SsoClient("https://sso.innotium.com",
                    client_id="sso-xxx", client_secret="xxx")

    # 로그인 검증
    try:
        info = sso.login("kim", "plain_password")
        user_id = info["userId"]  # 자체 DB에 FK로 저장
        dept_id = info["primaryDepartment"]["departmentId"]
    except SsoApiError as e:
        if e.message_key == "INVALID_CREDENTIALS":
            print("비밀번호가 틀렸습니다.")

    # 비밀번호 변경
    sso.change_password("kim", "old", "NewPass1234!")

    # 사용자 상세
    user = sso.get_user(user_id)
"""
import time
import base64
import logging
from typing import Optional, Dict, Any, List

import requests

log = logging.getLogger(__name__)


class SsoApiError(Exception):
    def __init__(self, status_code: int, message_key: str, raw: dict):
        self.status_code = status_code
        self.message_key = message_key
        self.raw = raw
        super().__init__(f"SSO API {status_code} {message_key}")


class SsoClient:
    def __init__(self, base_url: str, client_id: str, client_secret: str, timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout
        self._token: Optional[str] = None
        self._expires_at: float = 0.0

    # ──────── 토큰 관리 ────────
    def _fetch_token(self) -> None:
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        res = requests.post(
            f"{self.base_url}/apie/sso/oauth/client-token",
            headers={"Authorization": f"Basic {basic}"},
            timeout=self.timeout,
        )
        self._raise_for_error(res)
        body = res.json()
        self._token = body["access_token"]
        self._expires_at = time.time() + body["expires_in"] - 60

    def _auth(self) -> Dict[str, str]:
        if self._token is None or time.time() >= self._expires_at:
            self._fetch_token()
        return {"Authorization": f"Bearer {self._token}"}

    # ──────── 로그인 검증 ────────
    def login(self, login_id: str, password: str) -> Dict[str, Any]:
        """
        외부 앱 로그인 폼에서 호출.
        성공 시 userId, name, departments 등 반환 (ResExtUser).
        실패 시 SsoApiError (INVALID_CREDENTIALS, ACCOUNT_LOCKED 등).
        """
        res = requests.post(
            f"{self.base_url}/apie/sso/auth/login",
            headers={**self._auth(), "Content-Type": "application/json"},
            json={"loginId": login_id, "password": password},
            timeout=self.timeout,
        )
        self._raise_for_error(res)
        return res.json()

    # ──────── 비밀번호 변경 ────────
    def change_password(self, login_id: str, current_password: str, new_password: str) -> bool:
        res = requests.post(
            f"{self.base_url}/apie/sso/auth/password",
            headers={**self._auth(), "Content-Type": "application/json"},
            json={"loginId": login_id,
                  "currentPassword": current_password,
                  "newPassword": new_password},
            timeout=self.timeout,
        )
        self._raise_for_error(res)
        return res.json().get("changed") is True

    # ──────── 사용자 조회 ────────
    def get_user(self, user_id: int) -> Dict[str, Any]:
        res = requests.get(
            f"{self.base_url}/apie/sso/users/{user_id}",
            headers=self._auth(), timeout=self.timeout)
        self._raise_for_error(res)
        return res.json()

    def list_users(self, keyword: Optional[str] = None, department_id: Optional[int] = None,
                    status: Optional[str] = None, start_index: int = 0, page_size: int = 50) -> List[Dict[str, Any]]:
        params = {"startIndex": start_index, "pageSize": page_size}
        if keyword: params["keyword"] = keyword
        if department_id: params["departmentId"] = department_id
        if status: params["status"] = status
        res = requests.get(f"{self.base_url}/apie/sso/users",
                           headers=self._auth(), params=params, timeout=self.timeout)
        self._raise_for_error(res)
        return res.json()

    # ──────── 부서 조회 ────────
    def get_department(self, department_id: int) -> Dict[str, Any]:
        res = requests.get(f"{self.base_url}/apie/sso/departments/{department_id}",
                           headers=self._auth(), timeout=self.timeout)
        self._raise_for_error(res)
        return res.json()

    def list_departments(self, keyword: Optional[str] = None, status: Optional[str] = None,
                          start_index: int = 0, page_size: int = 500) -> List[Dict[str, Any]]:
        params = {"startIndex": start_index, "pageSize": page_size}
        if keyword: params["keyword"] = keyword
        if status: params["status"] = status
        res = requests.get(f"{self.base_url}/apie/sso/departments",
                           headers=self._auth(), params=params, timeout=self.timeout)
        self._raise_for_error(res)
        return res.json()

    # ──────── 유틸 ────────
    @staticmethod
    def _raise_for_error(res: requests.Response) -> None:
        if res.status_code >= 400:
            try:
                body = res.json()
                raise SsoApiError(res.status_code, body.get("messageKey", "UNKNOWN"), body)
            except ValueError:
                raise SsoApiError(res.status_code, "PARSE_ERROR", {"raw": res.text})


# ──────── 실행 예시 ────────
if __name__ == "__main__":
    import os, sys
    logging.basicConfig(level=logging.INFO)

    sso = SsoClient(
        base_url=os.environ.get("SSO_BASE_URL", "https://sso.innotium.com"),
        client_id=os.environ["SSO_CLIENT_ID"],
        client_secret=os.environ["SSO_CLIENT_SECRET"],
    )

    if len(sys.argv) >= 3:
        login_id, password = sys.argv[1], sys.argv[2]
        try:
            info = sso.login(login_id, password)
            print(f"✅ 로그인 성공: {info['name']} (userId={info['userId']})")
            print(f"   소속: {info['primaryDepartment']['departmentName']}")
            print(f"   전체 부서: {[d['departmentName'] for d in info['departments']]}")
        except SsoApiError as e:
            print(f"❌ {e.message_key}")
