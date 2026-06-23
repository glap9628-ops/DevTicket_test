# 이노티움 SSO 연동 가이드 (중앙 집중형 인증)

외부 시스템이 이노티움 SSO 서버를 통해 **사용자 인증·비밀번호 관리·사용자/부서 조회**를 수행하는 방법을 안내합니다.

**마지막 업데이트**: 2026-04-17
**Base URL**: `https://sso.innotium.com` (예시)
**API Prefix**: `/apie` (External system)

---

## 🎯 아키텍처

```
    [외부 앱 A]              [외부 앱 B]             [외부 앱 C]
        │                       │                       │
        │  로그인 폼에 입력된 ID+PW를 SSO에 그대로 전달  │
        ▼                       ▼                       ▼
        ═══════════════════════════════════════════════════
                   SSO 서버 (중앙 인증·데이터 저장)
         - 비밀번호 BCrypt 검증
         - 성공 시 userId / departmentId 반환
         - 비밀번호 변경 → 모든 외부 앱에 즉시 반영
```

- **외부 앱은 사용자·비밀번호 정보를 로컬 DB에 저장하지 않습니다.**
- **외부 앱의 자체 데이터**(게시글 등)는 SSO의 `userId`/`departmentId`를 FK로 참조하세요.
- 비밀번호 해시는 SSO만 보관합니다.

---

## 📚 API 목록

| # | 용도 | 엔드포인트 |
|---|------|-----------|
| 1 | 클라이언트 토큰 발급 (선택) | `POST /apie/sso/oauth/client-token` |
| 2 | **로그인 검증** | `POST /apie/sso/auth/login` |
| 3 | **비밀번호 변경** | `POST /apie/sso/auth/password` |
| 4 | 사용자 단건 조회 | `GET /apie/sso/users/{userId}` |
| 5 | 사용자 목록 조회 | `GET /apie/sso/users?...` |
| 6 | 부서 단건 조회 | `GET /apie/sso/departments/{departmentId}` |
| 7 | 부서 목록 조회 | `GET /apie/sso/departments` |
| 8 | 부서 일괄 동기화 (선택) | `GET /apie/sync/departments` |
| 9 | 직원 일괄 동기화 (선택) | `GET /apie/sync/end-users` |

---

## 1. 인증 방식

모든 `/apie/**` 엔드포인트는 **두 가지 인증 방식**을 지원합니다.

### Basic Auth
```
Authorization: Basic base64(client_id:client_secret)
```

### Bearer JWT (권장 — 고빈도 호출)
먼저 Basic Auth로 1회 호출해 JWT를 받아 이후 재사용.

```
POST /apie/sso/oauth/client-token
Authorization: Basic ...

→ { "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600 }
```
이후:
```
Authorization: Bearer eyJ...
```

---

## 2. 로그인 검증 API ⭐

사용자가 외부 앱 로그인 폼에 입력한 `loginId + password`를 SSO에 전달해 검증합니다.

### 요청
```http
POST /apie/sso/auth/login
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "loginId": "kim",       // 계정 loginId / 사번 / 이메일 어느 것이든 OK
  "password": "plain"
}
```

### 성공 응답 (200)
```json
{
  "userId": 5,                       // ★ SSO의 end_user_id PK — 외부 앱이 FK로 저장
  "employeeNo": "10012764",
  "loginId": "kim",
  "name": "김수민",
  "email": "kim@innotium.com",
  "position": "과장",
  "jobTitle": "Manager",
  "phone": null,
  "mobile": "010-xxxx-xxxx",
  "status": "active",
  "primaryDepartment": {
    "departmentId": 10,              // ★ SSO의 department_id PK
    "departmentCode": "DEV",
    "departmentName": "개발본부",
    "primary": true
  },
  "departments": [
    { "departmentId": 10, "departmentCode": "DEV", "departmentName": "개발본부", "primary": true },
    { "departmentId": 12, "departmentCode": "RND", "departmentName": "R&D센터", "primary": false }
  ]
}
```

### 외부 앱 구현 권장 패턴
1. 로그인 화면에서 SSO `/auth/login` 호출
2. **성공 시**: 응답의 `userId`, `primaryDepartment.departmentId` 등을 자체 세션에 저장
3. 자체 세션 토큰 발급 후 사용자에게 쿠키로 전달
4. 이후 페이지 요청마다 자체 세션으로 인증 (SSO 재호출 불필요)
5. 사용자 이름/부서명 표시 필요 시에만 `GET /apie/sso/users/{userId}` 조회

### 실패 응답
| HTTP | messageKey | 상황 |
|------|-----------|------|
| 401 | `ACCOUNT_NOT_FOUND` | 미등록 계정 |
| 401 | `INVALID_CREDENTIALS` | 비밀번호 불일치 (실패 카운터 증가) |
| 403 | `ACCOUNT_DISABLED` | 비활성/퇴사 계정 |
| 403 | `ACCOUNT_LOCKED` | 연속 실패로 잠김 |

---

## 3. 비밀번호 변경 API ⭐

외부 앱의 비밀번호 변경 화면에서 호출합니다. **SSO에 단일 저장되므로 변경 즉시 모든 외부 앱에 반영**됩니다.

### 요청
```http
POST /apie/sso/auth/password
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "loginId": "kim",
  "currentPassword": "old",
  "newPassword": "NewPass1234!"
}
```

### 성공 응답 (200)
```json
{ "changed": true, "messageKey": "PASSWORD_CHANGED" }
```

### 실패
| messageKey | 상황 |
|-----------|------|
| `INVALID_CREDENTIALS` | 현재 비밀번호 불일치 |
| `PASSWORD_TOO_SHORT` | 정책 미달 |
| `PASSWORD_REQUIRE_UPPER` | 대문자 필요 |
| `PASSWORD_REQUIRE_NUMBER` | 숫자 필요 |
| `PASSWORD_REQUIRE_SPECIAL` | 특수문자 필요 |
| `PASSWORD_REUSED` | 최근 N개 비밀번호와 동일 (이력 검사 on 시) |

### 복잡도·이력 정책
관리자 콘솔 **설정** 메뉴에서 관리:
- 최소 길이, 대문자·숫자·특수문자 요구 여부
- **비밀번호 재사용 검사 on/off** + 최근 N개 저장 개수

---

## 4. 사용자 조회 API

### 단건
```http
GET /apie/sso/users/{userId}
Authorization: Bearer <JWT>
```
응답 포맷은 **로그인 성공 응답과 동일** (`userId`, `departments`, ...).

### 목록
```http
GET /apie/sso/users?keyword=홍&departmentId=10&status=active&startIndex=0&pageSize=50
Authorization: Bearer <JWT>
```
응답 헤더: `List-Total-Count: <전체 건수>`

---

## 5. 부서 조회 API

### 단건
```http
GET /apie/sso/departments/{departmentId}
```
```json
{
  "departmentId": 10,
  "departmentCode": "DEV",
  "departmentName": "개발본부",
  "parentDepartmentId": 1,
  "sortOrder": 10,
  "status": "active",
  "description": "제품 개발 본부"
}
```

### 목록
```http
GET /apie/sso/departments?keyword=개발&status=active&startIndex=0&pageSize=500
```

---

## 6. 일괄 동기화 API (선택)

초기 세팅이나 드물게 데이터 검증 시 사용. **보통은 필요 없음** (실시간 조회 API로 충분).

### 부서 전체 / 변경분
```
GET /apie/sync/departments?since=&page=0&pageSize=500
```

### 직원 전체 / 변경분
```
GET /apie/sync/end-users?since=&page=0&pageSize=500
```

응답에는 `data` 배열과 `deletions` 배열이 포함됩니다. **비밀번호 해시는 포함되지 않습니다** (중앙 집중형 전환).

---

## 7. PK(Primary Key) 보존 정책

외부 앱이 `userId` / `departmentId`를 자체 DB에 저장하고 참조하기 때문에, SSO는 **PK를 영구 보존**합니다.

| 동작 | 실제 처리 |
|------|----------|
| 직원 "삭제" (관리자 콘솔) | `status='retired'` + `leave_date=today` — 행은 유지 |
| 부서 "삭제" | `status='inactive'` — 행은 유지 |
| 해당 계정 로그인 | `ACCOUNT_DISABLED` 반환 |
| 해당 PK로 조회 | 정상 응답 (status 필드 참고하여 UI에 "(퇴사)" 등 표시) |

외부 앱은 자체 데이터의 FK가 고아가 되지 않음.

---

## 8. 에러 응답 포맷

```json
{
  "statusCode": 401,
  "messageKey": "INVALID_CREDENTIALS",
  "params": {},
  "timestamp": "2026-04-17T10:00:00Z"
}
```

### 전체 messageKey
| HTTP | messageKey |
|------|-----------|
| 400 | `MISSING_LOGIN_ID`, `PASSWORD_TOO_SHORT`, `PASSWORD_REQUIRE_*`, `PASSWORD_REUSED` |
| 401 | `MISSING_AUTHORIZATION`, `INVALID_AUTHORIZATION`, `INVALID_TOKEN`, `INVALID_CLIENT`, `INVALID_CLIENT_SECRET`, `ACCOUNT_NOT_FOUND`, `INVALID_CREDENTIALS` |
| 403 | `ACCOUNT_DISABLED`, `ACCOUNT_LOCKED` |

---

## 9. 언어별 샘플

`docs/samples/`:
- **Python**: `sso_client.py`
- **Node.js**: `sso-client.js`
- **Java 11+**: `SsoClient.java`
- **C# .NET 6+**: `SsoClient.cs`
- **Spring Boot**: `spring-boot-example/` (LoginController + SsoVerifyService)

모든 샘플이 JWT 자동 발급·갱신 + 로그인·비밀번호 변경·조회를 지원합니다.

---

## 🔒 보안 체크리스트

- [ ] HTTPS 필수 (평문 비밀번호가 네트워크 통과)
- [ ] `client_secret`은 환경변수/secret vault에 보관
- [ ] JWT는 메모리에만 (파일·로그에 남기지 않기)
- [ ] 로그인 실패 응답을 외부에 노출할 때 `ACCOUNT_NOT_FOUND`와 `INVALID_CREDENTIALS`를 **같은 메시지**로 표시 (사용자 존재 여부 노출 방지)
- [ ] 비밀번호 입력 필드는 감사 로그에 남기지 않기
- [ ] 외부 앱이 보관하는 userId/departmentId는 정수 값이므로 SQL 인젝션 위험 없음

문의: innotium-sso-team@innotium.com
