# DevTicket - 개발 요청 관리 시스템

> 개발팀으로 들어오는 모든 개발 요청 건을 한 곳에서 접수/관리하고,
> 개발자가 직접 티켓을 픽업하여 처리하는 작업 관리 시스템

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [역할 및 권한](#4-역할-및-권한)
5. [티켓 타입](#5-티켓-타입)
6. [티켓 번호 규칙](#6-티켓-번호-규칙)
7. [상태 흐름](#7-상태-흐름)
8. [화면 목록](#8-화면-목록)
9. [API 명세](#9-api-명세)
10. [데이터베이스 스키마](#10-데이터베이스-스키마)
11. [배포 구성](#11-배포-구성)
12. [추후 고도화 계획](#12-추후-고도화-계획)

---

## 1. 프로젝트 개요

### 배경

현재 QA 오류, 데브옵스 요청, 내부 개발 건이 여러 경로(메신저, 구두, 이메일 등)로 들어와 누락되거나 우선순위가 불명확한 상황. 이를 해결하기 위해 모든 개발 요청을 단일 시스템에서 접수·추적·완료까지 관리하는 티켓 시스템을 구축한다.

### 핵심 기능

- 티켓 타입별 맞춤 등록 폼 (QA오류 / 데브옵스 / 내부개발 / 업체요청)
- 개발자 자율 픽업 방식 (선착순)
- 상태 기반 워크플로우 + 역할별 전환 권한 제어
- 전체 이력(타임라인) 보관
- 대시보드 지표 4종: 상태별 현황 / 타입별 분포 / 지연 티켓 / 개발자별 현황

---

## 2. 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Java 17, Spring Boot 3.5.11, MyBatis |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Redux Toolkit |
| Database | PostgreSQL 16 |
| Auth | FastAPI (Python) — 기존 innoRelease 인증 서비스 재사용 |
| Gateway | Nginx (reverse proxy + edge auth) |
| 배포 | Docker Compose |

---

## 3. 시스템 아키텍처

```
[브라우저] → :8080
               │
           [Nginx Gateway]
           ├── /api/auth/login     → auth 서비스 (FastAPI :8000)
           ├── /api/auth/          → auth 서비스 (인증 불필요)
           ├── /devticket/api/     → backend (Spring Boot :8082)
           │     └── auth_request → /internal/auth/verify
           │         └── X-ERP-User-Id / Username / Display-Name / Role / Group-Id 헤더 주입
           └── /devticket/         → frontend (Nginx static :80)
```

### 인증 흐름

1. 브라우저 → `/api/auth/login` → auth 서비스에서 JWT 쿠키 발급
2. 이후 API 요청 시 gateway가 `/internal/auth/verify` 로 쿠키 검증
3. 검증 성공 시 `X-ERP-*` 헤더를 backend에 전달
4. `AuthInterceptor`가 헤더에서 사용자 정보 추출 → `UserContextHolder`에 저장
5. group_id 기반으로 devticket 역할 매핑 (아래 [역할 및 권한](#4-역할-및-권한) 참고)

### 역할 매핑

```
auth role = "admin"   → ADMIN
group_id = 1 (관리자) → ADMIN
group_id = 2 (개발자) → DEVELOPER
그 외               → REQUESTER
```

---

## 4. 역할 및 권한

| 역할 | 설명 | 주요 권한 |
|------|------|-----------|
| **REQUESTER** | 요청자 (QA, 업무담당자 등) | 티켓 등록, 내 티켓 조회, QA→완료/재검토 처리 |
| **DEVELOPER** | 개발자 | 티켓 픽업, 상태 변경 (처리중→QA검토/보류/반려) |
| **ADMIN** | 관리자 | 모든 권한 + 계정 관리, 긴급 여부 조정, 개발자별 현황 확인 |

### 계정 관리

- 자체 회원가입 없음. 관리자가 직접 계정 생성 후 역할(그룹) 부여
- 기본 관리자 계정: `admin / admin1234`

---

## 5. 티켓 타입

| 코드 | 타입명 | Prefix | 추가 필드 |
|------|--------|--------|-----------|
| 1 | QA 오류 | QA | 빌드/버전 번호, 재현 환경, 재현 순서, 예상 동작, 실제 동작 |
| 2 | 데브옵스 지원 | DO | 대상 서버, 작업 내용 |
| 3 | 내부 개발 | DEV | 요청 배경, 요구사항, 참고 자료(링크) |
| 4 | 업체 요청 | VEN | 업체명, 요청 내용, 기한 |

- 모든 타입에 **긴급 여부 체크박스** 제공
- 긴급 티켓은 목록에서 뱃지(🔴)로 표시, 정렬 우선순위 최상단

---

## 6. 티켓 번호 규칙

```
형식: {Prefix}-{4자리 일련번호}
예시: QA-0001, DO-0002, DEV-0003, VEN-0004
```

- 타입 구분 없이 전체 통합 순번 (`dts_ticket_no_seq` PostgreSQL 시퀀스)
- 긴급 여부는 번호에 반영하지 않음

---

## 7. 상태 흐름

```
[대기(WAITING)]
     │
     ▼ 개발자/관리자 픽업
[진행중(IN_PROGRESS)]
     ├──▶ [보류(ON_HOLD)]        ← 개발자/관리자, 사유 필수
     ├──▶ [반려(REJECTED)]       ← 개발자/관리자, 사유 필수
     └──▶ [QA검토(QA_REVIEW)]   ← 개발자/관리자, 사유 선택
               │
               ├──▶ [완료(DONE)]          ← 요청자만, 사유 선택
               └──▶ [진행중(IN_PROGRESS)] ← 요청자만, 사유 필수 (재검토 요청)

[완료(DONE)]
     └──▶ [대기(WAITING)]  ← 완료 후 7일 이내만, 사유 필수 (재오픈)
```

### 상태 전환 권한 및 사유 입력

| 전환 | 권한 | 사유 |
|------|------|------|
| 대기 → 진행중 (픽업) | DEVELOPER, ADMIN | 선택 |
| 진행중 → QA검토 | DEVELOPER, ADMIN | 선택 |
| 진행중 → 보류 | DEVELOPER, ADMIN | **필수** |
| 진행중 → 반려 | DEVELOPER, ADMIN | **필수** |
| QA검토 → 진행중 | REQUESTER (요청자) | **필수** |
| QA검토 → 완료 | REQUESTER (요청자) | 선택 |
| 완료 → 대기 (재오픈) | 모든 역할 | **필수** (7일 이내) |

### 상태 코드표

| 코드 | 상태명 | 표시 색상 |
|------|--------|-----------|
| 1 | 대기 | 회색 |
| 2 | 진행중 | 파란색 |
| 3 | QA검토 | 보라색 |
| 4 | 완료 | 초록색 |
| 5 | 보류 | 노란색 |
| 6 | 반려 | 빨간색 |

---

## 8. 화면 목록

### 8-1. 로그인 (`/devticket/login`)

- ID/PW 입력 후 JWT 쿠키 발급
- 로그인 성공 시 대시보드로 리다이렉트

### 8-2. 대시보드 (`/devticket/dashboard`)

지표 4종:

| 지표 | 내용 |
|------|------|
| 상태별 티켓 수 | 대기 N / 진행중 N / QA검토 N / 완료 N |
| 타입별 분포 | QA / DO / DEV / VEN 건수 |
| 지연 티켓 | 3일 이상 대기 중인 티켓 목록 |
| 개발자별 현황 | 담당자별 진행중/완료 건수 |

### 8-3. 티켓 보드 (`/devticket/tickets`)

- 리스트 형태, 상태/타입/긴급/키워드/날짜 범위로 필터
- 긴급 티켓 상단 정렬
- 페이지네이션 (기본 20건)
- 클릭 시 상세 화면으로 이동

### 8-4. 티켓 등록 (`/devticket/tickets/new`)

- 타입 선택 → 타입별 추가 필드 표시 (동적 폼)
- 제목, 긴급 여부 공통 입력
- 등록 후 상세 화면으로 이동

### 8-5. 티켓 상세 (`/devticket/tickets/:id`)

- 티켓 기본 정보 + 타입별 추가 필드 표시
- 역할 기반 상태 변경 버튼 노출
- 보류/반려 시 사유 입력 모달
- 타임라인: 전체 상태 변경 이력 (누가, 언제, 어떤 이유로)

### 8-6. 내 티켓 (`/devticket/my-tickets`)

- 요청자 본인이 등록한 티켓 목록
- 보류/반려 사유 확인 가능
- 완료 후 7일 이내 재오픈 버튼 표시

### 8-7. 관리자 (`/devticket/admin`)

- 계정 관리 (생성, 역할 부여, 비활성화) — ADMIN 전용
- 긴급 여부 강제 조정
- 개발자별 처리 현황 상세 보기

---

## 9. API 명세

모든 API는 `Authorization` 쿠키(JWT) 기반 인증 필요.
응답 형식: `{ "statusCode": 200, "message": "OK", "data": {...} }`

### 티켓

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| `POST` | `/devticket/api/tickets` | 티켓 생성 | 전체 |
| `GET` | `/devticket/api/tickets` | 티켓 목록 조회 (필터/페이징) | 전체 |
| `GET` | `/devticket/api/tickets/{id}` | 티켓 상세 조회 | 전체 |
| `PUT` | `/devticket/api/tickets/{id}/status` | 상태 변경 | 역할 제한 |
| `PUT` | `/devticket/api/tickets/{id}/pickup` | 티켓 픽업 | DEVELOPER, ADMIN |
| `PUT` | `/devticket/api/tickets/{id}/urgent` | 긴급 여부 변경 | ADMIN |

### 대시보드

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/devticket/api/dashboard` | 대시보드 지표 전체 |

### 사용자

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/devticket/api/me` | 현재 로그인 사용자 정보 (devticket 역할 포함) |

### 요청/응답 예시

**티켓 생성**
```json
POST /devticket/api/tickets
{
  "ticketType": 1,
  "title": "로그인 페이지 500 오류",
  "isUrgent": true,
  "extraFields": {
    "buildVersion": "v1.2.3",
    "reproEnv": "운영",
    "reproSteps": "1. 로그인 페이지 접속\n2. ID/PW 입력 후 로그인 클릭",
    "expected": "메인 화면으로 이동",
    "actual": "500 Internal Server Error"
  }
}
```

**티켓 목록 조회 (필터)**
```
GET /devticket/api/tickets?ticketType=1&status=2&isUrgent=true&keyword=로그인&page=1&size=20
```

**상태 변경**
```json
PUT /devticket/api/tickets/1/status
{
  "status": 5,
  "reason": "관련 서버 점검 일정으로 인해 다음 주까지 보류"
}
```

**티켓 픽업**
```json
PUT /devticket/api/tickets/1/pickup
{
  "reason": "담당 인수"
}
```

---

## 10. 데이터베이스 스키마

### dts_tickets

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | BIGSERIAL PK | 내부 식별자 |
| `ticket_no` | VARCHAR UNIQUE | 표시용 번호 (예: QA-0001) |
| `ticket_type` | SMALLINT | 1=QA, 2=DevOps, 3=내부개발, 4=업체요청 |
| `title` | VARCHAR(200) | 제목 |
| `status` | SMALLINT | 1=대기, 2=진행중, 3=QA검토, 4=완료, 5=보류, 6=반려 |
| `is_urgent` | BOOLEAN | 긴급 여부 |
| `requester_id` | INTEGER | 등록자 ID |
| `requester_name` | VARCHAR | 등록자 이름 |
| `assignee_id` | INTEGER | 담당 개발자 ID |
| `assignee_name` | VARCHAR | 담당 개발자 이름 |
| `extra_fields` | JSONB | 타입별 추가 필드 |
| `created_at` | TIMESTAMPTZ | 생성일시 |
| `updated_at` | TIMESTAMPTZ | 최종 수정일시 |
| `completed_at` | TIMESTAMPTZ | 완료일시 (재오픈 가능 기간 계산용) |

### dts_ticket_history

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | BIGSERIAL PK | |
| `ticket_id` | BIGINT FK | dts_tickets.id |
| `from_status` | SMALLINT | 변경 전 상태 |
| `to_status` | SMALLINT | 변경 후 상태 |
| `reason` | TEXT | 변경 사유 |
| `changed_by_id` | INTEGER | 처리자 ID |
| `changed_by_name` | VARCHAR | 처리자 이름 |
| `changed_at` | TIMESTAMPTZ | 변경일시 |

### 시퀀스

| 이름 | 용도 |
|------|------|
| `dts_ticket_no_seq` | 티켓 번호 전체 통합 일련번호 |

### 기본 시드 데이터

| 그룹 | group_id | devticket 역할 |
|------|----------|----------------|
| 관리자 | 1 | ADMIN |
| 개발자 | 2 | DEVELOPER |
| 요청자 | 3 | REQUESTER |

---

## 11. 배포 구성

### Docker Compose 서비스

| 서비스 | 이미지 | 포트 | 역할 |
|--------|--------|------|------|
| `db` | postgres:16-alpine | 5432 | PostgreSQL 데이터베이스 |
| `auth` | ./auth (FastAPI) | 8000 | 인증 서비스 (JWT 발급/검증) |
| `backend` | ./backend (Spring Boot) | 8082 | DevTicket API |
| `frontend` | ./frontend (React + Nginx) | 80 | SPA 정적 파일 서빙 |
| `gateway` | ./gateway (Nginx) | **8080:80** | 진입점, 라우팅, edge 인증 |

### 주요 환경 변수 (backend)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DB_URL` | — | PostgreSQL JDBC URL |
| `DB_USERNAME` | — | DB 사용자명 |
| `DB_PASSWORD` | — | DB 패스워드 |
| `APP_AUTH_ENABLED` | `false` | `true`시 X-ERP 헤더 기반 인증 활성화 |

### 빌드 및 실행

```bash
# 전체 빌드 후 기동
docker-compose up -d --build

# 특정 서비스만 재빌드
docker-compose up -d --build backend frontend

# 로그 확인
docker-compose logs -f backend
docker-compose logs -f gateway
```

### 접속 URL

| 경로 | 설명 |
|------|------|
| `http://localhost:8080/devticket/login` | 로그인 |
| `http://localhost:8080/devticket/dashboard` | 대시보드 |
| `http://localhost:8080/devticket/tickets` | 티켓 보드 |

---

## 12. 추후 고도화 계획

- [ ] 알림 기능 (슬랙 웹훅 또는 이메일) — 1차 오픈 이후
- [ ] 칸반 보드 뷰 (현재 리스트 전용)
- [ ] WBS / 작업 공수 입력 및 집계
- [ ] 개발자별 처리량 통계 (월별/주별 추이)
- [ ] 파일 첨부 기능 (QA 오류 스크린샷 등)
- [ ] 티켓 댓글/메모 기능
- [ ] 관리자 화면 — 계정 관리 UI 완성
- [ ] 세션 유지 기간 설정 (system_settings)
