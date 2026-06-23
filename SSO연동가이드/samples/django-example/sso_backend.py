"""
Django Custom Authentication Backend for Innotium SSO (중앙 집중형 인증)

사용법:
  1. 이 파일을 앱 디렉토리에 복사 (예: myapp/sso_backend.py)
  2. settings.py에 추가:

    AUTHENTICATION_BACKENDS = [
        'myapp.sso_backend.SsoBackend',
        'django.contrib.auth.backends.ModelBackend',  # 로컬 관리자 계정용 (선택)
    ]

    SSO_BASE_URL = 'https://sso.innotium.com'
    SSO_CLIENT_ID = os.environ['SSO_CLIENT_ID']
    SSO_CLIENT_SECRET = os.environ['SSO_CLIENT_SECRET']

  3. 로그인 뷰에서 Django의 authenticate(request, username=..., password=...) 호출
     → SsoBackend.authenticate()가 SSO를 호출하여 검증

  4. 검증 성공 시 로컬 User 테이블에 upsert (SSO PK를 external_id로 저장)

주의:
  - Django User 테이블의 password 필드는 사용하지 않음 (SSO가 관리)
  - 비밀번호 변경은 별도 뷰에서 sso.change_password() 호출
"""
import os
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import BaseBackend
from django.conf import settings

# 같은 디렉토리의 sso_client.py 또는 공용 모듈 사용
from .sso_client import SsoClient, SsoApiError

User = get_user_model()
_sso = None


def _client():
    global _sso
    if _sso is None:
        _sso = SsoClient(settings.SSO_BASE_URL, settings.SSO_CLIENT_ID, settings.SSO_CLIENT_SECRET)
    return _sso


class SsoBackend(BaseBackend):
    """
    SSO를 통해 사용자 인증을 수행하는 Django 백엔드.
    authenticate()가 SSO에 로그인 요청 → 성공 시 로컬 User upsert.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None
        try:
            info = _client().login(username, password)
        except SsoApiError as e:
            # ACCOUNT_NOT_FOUND / INVALID_CREDENTIALS / ACCOUNT_DISABLED 등은 None 반환 → 로그인 실패
            return None

        # 로컬 User 테이블 upsert (SSO PK를 external_id 또는 username으로 사용)
        sso_user_id = info['userId']
        user, _created = User.objects.update_or_create(
            username=info['loginId'],
            defaults={
                'email': info.get('email') or '',
                'first_name': info.get('name') or '',
                'is_active': info.get('status') == 'active',
            }
        )
        # 필요 시 custom 필드 매핑:
        # user.sso_user_id = sso_user_id
        # user.primary_department_id = info['primaryDepartment']['departmentId']
        # user.save()

        # Django User의 password 필드는 사용하지 않음 (SSO가 관리)
        # set_unusable_password() 호출하거나 그대로 두기
        if user.has_usable_password():
            user.set_unusable_password()
            user.save(update_fields=['password'])

        return user

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None


# ──────── 비밀번호 변경 뷰 예시 ────────
"""
from django.views.decorators.http import require_POST
from django.http import JsonResponse

@require_POST
def change_password(request):
    current = request.POST.get('current_password')
    new = request.POST.get('new_password')
    try:
        _client().change_password(request.user.username, current, new)
        return JsonResponse({'changed': True})
    except SsoApiError as e:
        return JsonResponse({'error': e.message_key}, status=400)
"""
