"""
SsoClient를 django-example에도 복사하여 사용.
원본은 docs/samples/sso_client.py — 같은 파일이므로 symlink 또는 복사 중 선택.

실제 프로젝트에 넣을 때는 requirements.txt에:
  requests>=2.31
  bcrypt>=4.0   # Django의 auth_user 해시를 BCrypt로 맞춰야 할 경우

PASSWORD_HASHERS 관련:
  - SSO가 비밀번호를 보관하므로 외부 앱은 보통 불필요
  - 만약 레거시 호환으로 로컬 해시를 유지해야 한다면:
      PASSWORD_HASHERS = [
          'django.contrib.auth.hashers.BCryptPasswordHasher',  # Java Spring과 호환
      ]
    (주의: 기본 BCryptSHA256PasswordHasher는 Java BCrypt와 호환 안 됨)
"""
# 원본 sso_client.py 내용을 그대로 복사 — 생략 (docs/samples/sso_client.py 참조)
from .. import sso_client
SsoClient = sso_client.SsoClient
SsoApiError = sso_client.SsoApiError
