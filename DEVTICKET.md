# DevTicket — 개발 티켓 관리 시스템

> Innotium 내부 개발 요청 및 이슈 트래킹 시스템

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Java 17, Spring Boot 3, MyBatis |
| Auth | FastAPI (Python 3.12), JWT (HttpOnly Cookie) |
| Database | PostgreSQL 16 |
| Gateway | Nginx (reverse proxy + auth_request) |
| Infra | Docker Compose |

---

## 아키텍처

```
[Browser]
    │
    ▼
[Nginx Gateway :8080]
    ├── /api/auth/*       → Auth Service (FastAPI :8000)
    ├── /devticket/api/*  → Backend (Spring Boot :8082)  ← auth_request 검증
    └── /devticket/*      → Frontend (Nginx :80, SPA)
    
[PostgreSQL :5432]  ← Auth Service + Backend 공용
```

---

## 사용자 역할

| 역할 | 조건 | 권한 |
|------|------|------|
| **ADMIN** | `users.role = 'admin'` | 전체 권한 + 긴급 설정 + 사용자 관리 |
| **DEVELOPER** | `group_id IN (1, 2)` (데브옵스팀, 기술연구소팀) | 티켓 픽업/처리 |
| **REQUESTER** | 그 외 그룹 (QA팀, 영업팀 등) | 티켓 등록/조회/QA승인 |

---

## 티켓 유형

| 코드 | 이름 | 추가 필드 |
|------|------|-----------|
| 1 | QA 오류 | 빌드버전, 재현환경, 재현단계, 기대결과, 실제결과 |
| 2 | 데브옵스 | 대상 서버, 작업 내용 |
| 3 | 내부 개발 | 배경/목적, 요구사항, 참고링크 |
| 4 | 업체 요청 | 업체명, 요청 내용, 납기일 |

---

## 티켓 상태 흐름

```
대기(1) ──[픽업]──▶ 진행중(2) ──[QA요청]──▶ QA검증중(3)
                        │                        │
                    [보류/반려]              [재작업/완료]
                        ▼                        ▼
                   보류(5)/반려(6)            완료(4)
                                               │
                                      [재오픈, 7일 이내]
                                               ▼
                                            대기(1)
```

| 전환 | 실행 주체 | 사유 필요 |
|------|-----------|-----------|
| 대기 → 진행중 (픽업) | DEVELOPER, ADMIN | ✗ |
| 진행중 → QA검증중 | DEVELOPER, ADMIN | ✗ |
| 진행중 → 완료 | DEVELOPER, ADMIN | ✗ |
| 진행중 → 보류 | DEVELOPER, ADMIN | ✓ |
| 진행중 → 반려 | DEVELOPER, ADMIN | ✓ |
| QA검증중 → 재작업 | REQUESTER | ✓ |
| QA검증중 → 완료 | REQUESTER | ✗ |
| 완료 → 대기 (재오픈) | 모든 역할 (7일 이내) | ✓ |

---

## 구현 현황

### 페이지

#### 로그인 (`/devticket/login`)
- [x] 아이디/비밀번호 로그인
- [x] JWT HttpOnly 쿠키 발급
- [x] 오류 메시지 표시

#### 대시보드 (`/devticket/dashboard`)
- [x] 상태별 도넛 차트 (대기/진행중/QA검증중/완료)
- [x] 유형별 바 차트
- [x] 제품별 도넛 차트
- [x] 개발자별 워크로드 테이블 (진행중/QA/완료 건수)
- [x] 완료 건수 클릭 시 해당 티켓 목록 모달
- [x] 지연 티켓 목록 (3일 이상 대기)

#### 티켓 보드 (`/devticket/board`)
- [x] 티켓 목록 (페이지네이션, 20건)
- [x] 필터: 유형, 상태, 제품명, 긴급, 키워드
- [x] 픽업/픽업취소 버튼 (역할 기반)
- [x] 상세 페이지 이동

#### 티켓 등록 (`/devticket/tickets/new`)
- [x] 유형 선택 카드 UI
- [x] 유형별 동적 폼
- [x] 제품명 선택
- [x] 긴급 여부 체크박스

#### 티켓 상세 (`/devticket/tickets/:id`)
- [x] 티켓 정보 전체 조회
- [x] 역할별 상태 변경 액션 버튼
- [x] 상태 변경 사유 입력 모달
- [x] 긴급 아이콘 표시
- [x] 수정 모드 (제목, 제품명, 긴급, 유형별 필드)
- [x] 변경 이력 타임라인

#### 내 티켓 (`/devticket/my-tickets`)
- [x] 내가 요청한 티켓 탭
- [x] 내가 담당한 티켓 탭 (DEVELOPER/ADMIN)
- [x] 완료 티켓 재오픈 (7일 이내)

#### 어드민 (`/devticket/admin`)
- [x] 티켓 관리: 긴급 토글, 개발자 워크로드 통계
- [x] 사용자 관리: 생성, 목록, 활성화/비활성화

---

### API 엔드포인트

#### Backend (Spring Boot `/devticket/api`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/tickets` | 티켓 생성 |
| GET | `/tickets` | 목록 조회 (type/status/urgent/keyword/product 필터) |
| GET | `/tickets/{id}` | 단건 조회 |
| PATCH | `/tickets/{id}` | 티켓 수정 |
| PUT | `/tickets/{id}/status` | 상태 변경 |
| PUT | `/tickets/{id}/pickup` | 픽업 |
| DELETE | `/tickets/{id}/pickup` | 픽업 취소 |
| PUT | `/tickets/{id}/urgent` | 긴급 설정 (ADMIN) |
| GET | `/dashboard` | 대시보드 통계 |
| GET | `/me` | 현재 사용자 정보 |

#### Auth Service (FastAPI `/api/auth`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/login` | 로그인 |
| POST | `/logout` | 로그아웃 |
| GET | `/verify` | JWT 검증 (Nginx auth_request용) |
| GET | `/me` | 내 정보 조회 |
| POST | `/refresh` | 토큰 갱신 |
| PUT | `/profile` | 프로필 수정 (비밀번호 변경 포함) |
| POST | `/me/avatar` | 아바타 업로드 |
| GET | `/apps` | 접근 가능한 앱 목록 |

---

## 보안 현황

| 항목 | 상태 | 비고 |
|------|------|------|
| JWT HttpOnly Cookie | ✅ | SameSite=Lax |
| bcrypt 패스워드 해싱 | ✅ | passlib, cost=12 |
| Nginx auth_request | ✅ | 모든 API 요청 검증 |
| 로그인 Rate Limit | ✅ | 5r/m, burst=10 |
| .env 비밀값 분리 | ✅ | .gitignore 처리 |
| HTTPS / Secure Cookie | ⚠️ | 내부망 전용, 외부 노출 시 필요 |
| nginx @unauthorized 처리 | ⚠️ | location 미정의 |
| APP_AUTH_ENABLED 기본값 | ⚠️ | 로컬 단독 실행 시 false |
| DB 포트 외부 노출 | ⚠️ | 5432 개발용 오픈 (프로덕션 시 제거) |

---

## 보완 검토 항목

### 기능

| 항목 | 우선순위 | 설명 |
|------|----------|------|
| 파일 첨부 | 중 | 티켓에 스크린샷/문서 첨부 |
| 댓글/메모 | 중 | 티켓 내 커뮤니케이션 |
| 알림 | 중 | 상태 변경 시 담당자/요청자 알림 (이메일 or Slack) |
| 칸반 보드 뷰 | 하 | 현재 리스트뷰만 존재 |
| 통계 기간 필터 | 하 | 대시보드 주간/월간 필터 |
| 티켓 검색 고도화 | 하 | 담당자/요청자 필터 UI 추가 |

### 보안

| 항목 | 우선순위 | 설명 |
|------|----------|------|
| nginx @unauthorized 정의 | 높 | 401 발생 시 로그인 페이지로 리다이렉트 |
| HTTPS 적용 | 상황에 따라 | 외부 노출 서버라면 필수 |
| DB 포트 비공개 | 중 | 프로덕션 배포 전 5432 포트 바인딩 제거 |
| APP_AUTH_ENABLED 기본값 변경 | 중 | `false` → `true`로 기본값 수정 |
| 어드민 기본 계정 비밀번호 | 높 | `admin1234` → 초기 설정 강제 |

---

## DB 주요 테이블

```
users ──── groups (FK)
  │
  └── dts_tickets (requester_id, assignee_id)
          │
          └── dts_ticket_history (ticket_id)
```

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 (bcrypt 해시, 그룹, 역할, 직위) |
| `groups` | 부서/팀 (데브옵스팀, 기술연구소팀, QA팀, 영업팀) |
| `dts_tickets` | 티켓 본체 (extra_fields JSONB) |
| `dts_ticket_history` | 상태 변경 이력 |
| `apps` | 앱 레지스트리 (innoRelease 통합용) |
| `system_settings` | JWT 만료시간, 자동 로그아웃 설정 |
