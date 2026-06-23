# Django 앱에서 이노티움 SSO 연동

## 설치
```bash
pip install requests
```

## settings.py 추가
```python
import os

SSO_BASE_URL = os.environ.get('SSO_BASE_URL', 'https://sso.innotium.com')
SSO_CLIENT_ID = os.environ['SSO_CLIENT_ID']
SSO_CLIENT_SECRET = os.environ['SSO_CLIENT_SECRET']

AUTHENTICATION_BACKENDS = [
    'myapp.sso_backend.SsoBackend',
    'django.contrib.auth.backends.ModelBackend',  # 로컬 수퍼유저용 (선택)
]
```

## 로그인 뷰
```python
from django.contrib.auth import authenticate, login as django_login

def login_view(request):
    username = request.POST['username']  # SSO loginId / 사번 / 이메일
    password = request.POST['password']
    user = authenticate(request, username=username, password=password)
    if user:
        django_login(request, user)
        return redirect('/')
    return render(request, 'login.html', {'error': '로그인 실패'})
```

## 비밀번호 변경 뷰
```python
from .sso_client import SsoClient, SsoApiError
from django.conf import settings

_sso = SsoClient(settings.SSO_BASE_URL, settings.SSO_CLIENT_ID, settings.SSO_CLIENT_SECRET)

@login_required
def change_password_view(request):
    try:
        _sso.change_password(
            login_id=request.user.username,
            current_password=request.POST['current_password'],
            new_password=request.POST['new_password'],
        )
        return JsonResponse({'changed': True})
    except SsoApiError as e:
        return JsonResponse({'error': e.message_key}, status=400)
```

## 중요: 비밀번호 해시 정책

Django의 기본 `BCryptSHA256PasswordHasher`는 **Java Spring의 BCryptPasswordEncoder와 호환되지 않습니다** (Django가 SHA256 pre-hash 후 BCrypt 적용). 

**하지만 이 시스템에서는 이 이슈가 발생하지 않습니다**:
- 비밀번호 검증은 모두 SSO 서버가 수행
- Django 앱은 로컬에 비밀번호 해시를 보관하지 않음
- Django User 테이블의 `password` 필드는 `set_unusable_password()` 처리

레거시 호환을 위해 Django도 BCrypt 해싱을 맞춰야 한다면:
```python
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.BCryptPasswordHasher',  # SHA256 없는 순수 BCrypt
]
```
그리고 `pip install bcrypt`.

## 사용자 정보 조회 (화면 렌더링)

Django User에 저장 안 된 정보(부서명 등)가 필요할 때:
```python
@login_required
def my_profile(request):
    info = _sso.get_user(request.user.sso_user_id)
    return render(request, 'profile.html', {
        'name': info['name'],
        'departments': info['departments'],
    })
```
