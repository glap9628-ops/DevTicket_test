# QA Sync API 연동 가이드 — 수신 서버 구축

## 개요

innoRelease(송신 서버)는 QA 등록 데이터를 외부 관리서버(수신 서버)로 자동 전송한다.
수신 서버는 **로컬 계정 세션 인증** 을 구현하고, `system` 계정 세션 쿠키를 통해 ticket 등록 API를 보호한다.

### 설계 원칙

| 원칙 | 내용 |
|---|---|
| SSO 완전 분리 | 수신 서버 로컬 계정은 SSO 연동과 무관하게 독립 운영 |
| PK 충돌 방지 | 로컬 계정 ID는 1000번부터 시작 (SSO 계정 ID 범위와 겹치지 않음) |
| 역할 테이블 분리 | 로컬 계정 역할(role)은 SSO 역할과 별개 테이블로 관리 |
| 자동화 전용 계정 | `system` 계정은 QA Sync 자동화에만 사용, 사람이 직접 사용 금지 |

### 문서 구성

| 파트 | 내용 |
|---|---|
| **Part A** | 로컬 계정 로그인 시스템 구축 |
| **Part B** | Ticket 등록 API 구현 및 연동 |
| **Part C** | 송신 측 (innoRelease) 동작 흐름 참고 |
| **Part D** | 검증 체크리스트 |
| **Part E** | 변경 이력 |

전제: 수신 서버는 Java + Spring Boot 프로젝트.

---

## Part A. 로컬 계정 로그인 시스템 구축

innoRelease 와 동일한 패턴을 따른다. 핵심 컴포넌트:

| 역할 | 클래스/파일 |
|---|---|
| 비밀번호 BCrypt 인코더 빈 | `PasswordEncoderConfig` |
| **로컬 역할 테이블 (DB)** | `dts_local_roles` ← SSO 역할과 분리된 독립 테이블 |
| 계정 테이블 (DB) | `dts_admin_account` (PK 1000번부터, `role_id` FK 포함) |
| 계정 모델/Mapper | `AdminAccount`, `AdminAccountMapper` |
| 계정 서비스 | `AdminAccountService` (verifyPassword, BCrypt matches) |
| 로그인 컨트롤러 | `AuthController` (POST /api/auth/login) |
| 세션 키 상수 | `SessionKeys` |
| 인증 사용자 객체 | `CurrentUser` (Serializable, 세션에 보관, 역할 정보 포함) |
| 인증 가드 | `AuthInterceptor` (HandlerInterceptor) |
| 라우팅 설정 | `WebMvcConfig` (login/logout 만 예외) |

---

### A-1. 의존성 (build.gradle)

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-security'  // BCrypt 만 사용
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.5'
    implementation 'org.postgresql:postgresql'
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

> Spring Security 전체를 도입할 필요 없이 BCrypt 만 쓰기 위해 starter 만 추가한다.
> 실제 보안 필터는 사용하지 않고 직접 `Interceptor` 로 처리한다 (innoRelease 와 동일).

---

### A-2. application.properties

```properties
# 세션 — 30분
server.servlet.session.timeout=30m
server.servlet.session.cookie.http-only=true
server.servlet.session.cookie.same-site=lax
server.servlet.session.cookie.name=DTSSESSION
```

> 로컬 개발 시 별도 인증 우회 플래그는 두지 않는다. 개발자도 별도 테스트 계정으로 로그인해서 사용한다.

---

### A-3. BCrypt 인코더 빈

```java
@Configuration
public class PasswordEncoderConfig {
    @Bean
    public BCryptPasswordEncoder bcryptPasswordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

---

### A-4. DB 마이그레이션

Flyway 또는 동등 도구로 적용한다.

#### A-4-1. 로컬 역할 테이블 (`dts_local_roles`)

> **SSO 역할과 완전 분리된 독립 테이블.** SSO 시스템의 role 체계에 영향을 주지 않으며 받지도 않는다.

```sql
-- V1__dts_local_roles.sql
CREATE TABLE dts_local_roles (
    id          SMALLINT     PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(200)
);

-- 기본 역할 정의
INSERT INTO dts_local_roles (id, name, description) VALUES
    (1, 'SYSTEM_SYNC',  'QA 자동화 연동 전용 — system 계정에 부여'),
    (2, 'LOCAL_ADMIN',  '로컬 관리자 — 수동 운영·모니터링용');
```

| id | name | 용도 |
|---|---|---|
| 1 | `SYSTEM_SYNC` | innoRelease 자동화 전용. `system` 계정에 부여 |
| 2 | `LOCAL_ADMIN` | 사람이 사용하는 운영 관리 계정에 부여 |

#### A-4-2. 로컬 계정 테이블 (`dts_admin_account`)

> PK 시퀀스를 **1000번부터** 시작해 SSO 계정 ID(1~999 범위)와의 충돌을 방지한다.

```sql
-- V2__dts_admin_account.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PK 시퀀스: 1000번부터 시작
CREATE SEQUENCE dts_admin_account_id_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE dts_admin_account (
    id            BIGINT       NOT NULL DEFAULT nextval('dts_admin_account_id_seq') PRIMARY KEY,
    login_id      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    name          VARCHAR(100) NOT NULL,
    role_id       SMALLINT     NOT NULL DEFAULT 1 REFERENCES dts_local_roles(id),
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 시퀀스를 컬럼에 귀속 (테이블 삭제 시 시퀀스도 함께 삭제)
ALTER SEQUENCE dts_admin_account_id_seq OWNED BY dts_admin_account.id;

-- system 계정 (innoRelease 연동 전용 — role_id=1: SYSTEM_SYNC)
-- ⚠ 비밀번호는 운영 배포 시 안전한 값으로 반드시 변경할 것
INSERT INTO dts_admin_account (login_id, password_hash, name, role_id)
VALUES (
    'system',
    crypt('CHANGE_ME_NOW', gen_salt('bf', 10)),
    'innoRelease 연동',
    1
);
```

**결과 확인**: 최초 INSERT 된 `system` 계정의 `id` 는 **1000** 이어야 한다.

```sql
SELECT id, login_id, name, role_id FROM dts_admin_account;
--  id   | login_id | name         | role_id
-- ------+----------+--------------+---------
--  1000 | system   | innoRelease 연동 |       1
```

> **MySQL 사용 시**: pgcrypto 를 사용할 수 없으므로 비밀번호 해시를 사전에 생성해서 평문 SQL 로 삽입한다.
> ```java
> new BCryptPasswordEncoder().encode("CHANGE_ME_NOW")
> // → $2a$10$xyz...   ← 이 값을 직접 INSERT
> ```
> MySQL AUTO_INCREMENT 시작값 변경: `ALTER TABLE dts_admin_account AUTO_INCREMENT = 1000;`

---

### A-5. Model / Mapper

```java
// AdminAccount.java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class AdminAccount {
    private Long   id;
    private String loginId;
    private String passwordHash;
    private String name;
    private Short  roleId;      // dts_local_roles.id (FK)
    private String roleName;    // JOIN 조회용 (dts_local_roles.name)
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

```java
// AdminAccountMapper.java
@Mapper
public interface AdminAccountMapper {
    AdminAccount selectByLoginId(@Param("loginId") String loginId);
}
```

```xml
<!-- adminAccount.xml -->
<mapper namespace="...AdminAccountMapper">
    <resultMap id="AdminAccountMap" type="...AdminAccount">
        <id     property="id"           column="id"/>
        <result property="loginId"      column="login_id"/>
        <result property="passwordHash" column="password_hash"/>
        <result property="name"         column="name"/>
        <result property="roleId"       column="role_id"/>
        <result property="roleName"     column="role_name"/>
        <result property="createdAt"    column="created_at"/>
        <result property="updatedAt"    column="updated_at"/>
    </resultMap>

    <select id="selectByLoginId" resultMap="AdminAccountMap">
        SELECT a.id,
               a.login_id,
               a.password_hash,
               a.name,
               a.role_id,
               r.name AS role_name,
               a.created_at,
               a.updated_at
          FROM dts_admin_account a
          JOIN dts_local_roles   r ON r.id = a.role_id
         WHERE a.login_id = #{loginId}
    </select>
</mapper>
```

---

### A-6. Service

```java
@Service
@RequiredArgsConstructor
public class AdminAccountService {

    private final AdminAccountMapper adminAccountMapper;
    private final BCryptPasswordEncoder bcryptPasswordEncoder;

    public Optional<AdminAccount> findByLoginId(String loginId) {
        return Optional.ofNullable(adminAccountMapper.selectByLoginId(loginId));
    }

    public boolean verifyPassword(AdminAccount account, String rawPassword) {
        if (account == null || rawPassword == null) return false;
        return bcryptPasswordEncoder.matches(rawPassword, account.getPasswordHash());
    }
}
```

---

### A-7. CurrentUser / SessionKeys

```java
// SessionKeys.java
public final class SessionKeys {
    public static final String CURRENT_USER = "dts.currentUser";
    private SessionKeys() {}
}
```

```java
// CurrentUser.java — 세션에 저장되는 사용자 정보. 반드시 Serializable.
@Getter @Builder
public class CurrentUser implements Serializable {
    private static final long serialVersionUID = 1L;
    private final Long   userId;
    private final String loginId;
    private final String name;
    private final Short  roleId;    // 로컬 역할 ID (dts_local_roles.id)
    private final String roleName;  // 로컬 역할명 (예: SYSTEM_SYNC)
}
```

---

### A-8. 로그인 컨트롤러

```java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AdminAccountService adminAccountService;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody ReqLogin req, HttpServletRequest request) {
        Optional<AdminAccount> opt = adminAccountService.findByLoginId(req.getLoginId());
        if (opt.isEmpty() || !adminAccountService.verifyPassword(opt.get(), req.getPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("ok", false, "message", "invalid credentials"));
        }
        AdminAccount account = opt.get();

        // 세션 고정 공격 방지: 새 세션 발급
        HttpSession existing = request.getSession(false);
        if (existing != null) existing.invalidate();
        HttpSession session = request.getSession(true);
        session.setAttribute(SessionKeys.CURRENT_USER,
                CurrentUser.builder()
                        .userId(account.getId())
                        .loginId(account.getLoginId())
                        .name(account.getName())
                        .roleId(account.getRoleId())
                        .roleName(account.getRoleName())
                        .build());

        return ResponseEntity.ok(Map.of(
                "ok",      true,
                "loginId", account.getLoginId(),
                "name",    account.getName(),
                "role",    account.getRoleName()
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
```

```java
// ReqLogin.java
@Data
public class ReqLogin {
    @NotBlank private String loginId;
    @NotBlank private String password;
}
```

---

### A-9. 인증 가드 (Interceptor)

```java
@Component
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws Exception {
        HttpSession session = req.getSession(false);
        CurrentUser user = (session == null) ? null
                : (CurrentUser) session.getAttribute(SessionKeys.CURRENT_USER);

        if (user == null) {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"ok\":false,\"message\":\"unauthorized\"}");
            return false;
        }
        return true;
    }
}
```

---

### A-10. 라우팅 설정

```java
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/login")
                .excludePathPatterns("/api/auth/logout");
    }
}
```

---

### A-11. 로컬 동작 확인

```bash
# 1. 로그인 → DTSSESSION 쿠키 받기
curl -i -X POST http://localhost:8082/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"system","password":"CHANGE_ME_NOW"}'

# 응답 예시
# HTTP/1.1 200 OK
# Set-Cookie: DTSSESSION=ABC123...; HttpOnly; SameSite=Lax
# {"ok":true,"loginId":"system","name":"innoRelease 연동","role":"SYSTEM_SYNC"}

# 2. 쿠키 없이 보호된 API 호출 → 401
curl -i -X POST http://localhost:8082/api/dts/tickets -d '{}'

# 3. 쿠키 첨부하고 호출 → 통과
curl -i -X POST http://localhost:8082/api/dts/tickets \
  -H "Cookie: DTSSESSION=ABC123..." \
  -H "Content-Type: application/json" \
  -d '{"title":"test"}'

# 4. 계정 PK 확인 (system 계정 id = 1000 이어야 함)
# psql: SELECT id, login_id, role_id FROM dts_admin_account WHERE login_id = 'system';
#  id   | login_id | role_id
# ------+----------+---------
#  1000 | system   |       1
```

여기까지 완료되면 Part A 종료. **다음으로 Ticket 등록 API 구현** 을 진행한다.

---

## Part B. QA Sync API 연동

### B-1. Ticket 등록 API 사양

#### Endpoint

```
POST /api/dts/tickets
```

> 경로 변경 시 송신 측 `.env` 의 `QA_SYNC_TICKET_ENDPOINT` 값만 변경하면 됨.

#### Request Headers

| Header | Value | 비고 |
|---|---|---|
| `Cookie` | `DTSSESSION=<로그인 시 받은 세션ID>` | system 계정 로그인 응답의 Set-Cookie 값 |
| `Content-Type` | `application/json` | UTF-8 |

#### Request Body (JSON)

```json
{
  "title":        "QA 오류_11.1.0.151",
  "productName":  "InnoECM",
  "platform":     "MANAGER",
  "errorBug":     "QA 중 발견된 에러/버그 전문 텍스트 (개행 포함)",
  "ticketType":   1,
  "buildVersion": "11.1.0.151",
  "qaFilePath":   "/share/qa/innoEcm/11.1.0.151"
}
```

#### 필드 명세

| JSON 필드 | 타입 | 길이 제한 | NULL 허용 | 설명 |
|---|---|---|---|---|
| `title` | string | 200 | N | 항상 `"QA 오류_" + buildVersion` 형식 |
| `productName` | string | 50 | N | 송신 측 InnoProduct 표시명. 예: `InnoECM`, `LizardBackup`, `RansomCruncher`, `nPouch`, `SecureZone`, `InnoMark`, `InnoLog` |
| `platform` | string | 50 | N | `MANAGER` 또는 `AGENT` |
| `errorBug` | string (TEXT) | 제한 없음 | Y (빈 문자열) | Error/Bug 전체 텍스트, 개행 `\n` 포함 가능 |
| `ticketType` | integer | - | N | 항상 `1` |
| `buildVersion` | string | 50 | Y (빈 문자열) | QA 기록의 versionEnd |
| `qaFilePath` | string (TEXT) | 제한 없음 | Y (빈 문자열) | QA 파일 경로 |

> 송신 측은 NULL 대신 빈 문자열 `""` 로 직렬화한다.

#### Response

| 상태 코드 | 의미 | 송신 측 동작 |
|---|---|---|
| **2xx** | 성공 | `qa_sync_status` 1 → 2 로 변경. body 내용 미사용 (권장: `{"ok": true, "ticketId": 12345}`) |
| **401** | 세션 만료 | 자동 재로그인 후 1회 재시도 |
| **그 외 4xx/5xx** | 실패 | 5분 후 자동 재시도, 최대 5회 후 `SYNC_FAIL` 확정. 실패 응답 body 는 `qa_sync_last_error` 에 저장 |

---

### B-2. 수신 측 dts_tickets 테이블

```sql
-- V3__dts_tickets.sql
CREATE TABLE dts_tickets (
    id            BIGSERIAL    PRIMARY KEY,
    title         VARCHAR(200) NOT NULL,
    product_name  VARCHAR(50)  NOT NULL,
    build_version VARCHAR(50),
    platform      VARCHAR(50)  NOT NULL,   -- MANAGER | AGENT
    error_bug     TEXT,
    qa_file_path  TEXT,
    ticket_type   SMALLINT     NOT NULL DEFAULT 1,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

JSON ↔ 컬럼 매핑:

| JSON 필드 | DB 컬럼 |
|---|---|
| `title` | `title` |
| `productName` | `product_name` |
| `platform` | `platform` |
| `errorBug` | `error_bug` |
| `ticketType` | `ticket_type` |
| `buildVersion` | `build_version` |
| `qaFilePath` | `qa_file_path` |

---

### B-3. Ticket 컨트롤러 / 서비스 (구현 예시)

```java
@RestController
@RequestMapping("/api/dts/tickets")
@RequiredArgsConstructor
public class TicketController {

    private final TicketService ticketService;

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody ReqCreateTicket req) {
        Long id = ticketService.create(req);
        return ResponseEntity.ok(Map.of("ok", true, "ticketId", id));
    }
}
```

```java
@Data
public class ReqCreateTicket {
    @NotBlank @Size(max = 200) private String title;
    @NotBlank @Size(max = 50)  private String productName;
    @NotBlank @Size(max = 50)  private String platform;
    private String errorBug;
    @NotNull private Integer ticketType;
    @Size(max = 50) private String buildVersion;
    private String qaFilePath;
}
```

---

### B-4. (강력 권장) 멱등 처리

송신 측은 일시적 네트워크 실패 시 같은 payload 를 재전송한다. 중복 ticket 생성을 막으려면:

```sql
CREATE UNIQUE INDEX uq_dts_tickets_dedup
    ON dts_tickets (product_name, build_version, title);
```

```java
@Transactional
public Long create(ReqCreateTicket req) {
    Ticket existing = ticketMapper.findByDedup(
            req.getProductName(), req.getBuildVersion(), req.getTitle());
    if (existing != null) return existing.getId();  // 중복 → 기존 id 로 200 OK
    // ... insert
}
```

---

### B-5. system 계정 운영 가이드

- `system` 계정은 **자동화 전용** (`role_id=1, SYSTEM_SYNC`). 사람이 직접 로그인해서는 안 됨.
- 초기 비밀번호 `CHANGE_ME_NOW` 는 운영 배포 직전에 반드시 변경.
- 변경 후 비밀번호를 송신 측 운영자에게 안전한 채널로 전달 (송신 측 `.env` 의 `QA_SYNC_PASSWORD` 갱신 필요).
- **무중단 비밀번호 변경**: 새 비밀번호를 가진 별도 계정 먼저 생성 → 송신 측을 새 계정으로 전환 → 구 계정 제거.
- `system` 계정에 다른 권한(예: 일반 관리 페이지 접근)은 부여하지 않는다. 권한 확장이 필요하면 `LOCAL_ADMIN` 역할(id=2)의 별도 계정 발급.
- 로그인 실패가 잦으면 송신 측 `.env` 비밀번호 오류 또는 계정 변경 후 미반영 가능성. 수신 측 로그에서 `loginId=system` 401 빈도를 모니터링.

---

## Part C. 송신 측 (innoRelease) 동작 흐름 (참고)

수신 서버 팀이 송신 측 동작을 이해하는 데 도움이 되는 정보.

```
[innoRelease 송신 측]                       [수신 서버]
   |                                            |
   | 1. POST /api/auth/login                    |
   |    Body: {loginId:"system", password:"..."}|
   | -----------------------------------------> |
   | <----------------------------------------- | 200 OK
   |   Set-Cookie: DTSSESSION=ABC123            | (system 인증 성공)
   |   (메모리에 쿠키 캐싱)                        |
   |                                            |
   | 2. POST /api/dts/tickets                   |
   |    Cookie: DTSSESSION=ABC123               |
   |    Body: {title, productName, ...}         |
   | -----------------------------------------> |
   | <----------------------------------------- | 200 OK {ticketId}
   |                                            |
   | 3. (30분 미사용 후) 401 응답 수신             |
   |    → 1번 자동 재실행 후 2번 재시도            |
```

### 송신 측 코드 위치 / 주요 설정

| 항목 | 값 |
|---|---|
| 송신 서버 코드 위치 | `backend/src/main/java/com/innotium/innorelease/common/sync/` |
| 핵심 클래스 | `QaSyncClient` (login + ticket 호출), `QaSyncService` (배치 처리), `QaSyncScheduler` (5분 주기) |
| 스케줄러 주기 | `.env QA_SYNC_SCHEDULE_MS` (기본 300000 ms) |
| 최대 재시도 | `.env QA_SYNC_MAX_ATTEMPTS` (기본 5) |
| 수동 트리거 | `POST /api/qa-sync/run` (전체 대기 처리), `POST /api/qa-sync/{id}` (단건 강제) |

### 송신 측 .env (참고)

```env
QA_SYNC_ENABLED=true
QA_SYNC_BASE_URL=https://수신서버-주소
QA_SYNC_LOGIN_ID=system
QA_SYNC_PASSWORD=수신측에서 알려준 비밀번호
QA_SYNC_LOGIN_ENDPOINT=/api/auth/login
QA_SYNC_TICKET_ENDPOINT=/api/dts/tickets
QA_SYNC_TARGET_REPO_IDS=1,2,5
QA_SYNC_SCHEDULE_MS=300000
QA_SYNC_MAX_ATTEMPTS=5
QA_SYNC_REQUEST_TIMEOUT_MS=10000
```

---

## Part D. 검증 체크리스트

수신 서버 구현 완료 후 자체 점검:

### DB 구조
- [ ] `dts_local_roles` 테이블이 존재하고 id=1(`SYSTEM_SYNC`), id=2(`LOCAL_ADMIN`) 데이터 확인
- [ ] `dts_admin_account` PK 시퀀스가 1000번부터 시작
- [ ] `system` 계정의 `id = 1000`, `role_id = 1` 확인
- [ ] `dts_admin_account.role_id` → `dts_local_roles.id` FK 정상 동작

### 로그인 시스템
- [ ] `POST /api/auth/login` 에 `{loginId:"system", password:"<올바른 값>"}` 보내면 200 + `Set-Cookie: DTSSESSION=...` 응답
- [ ] 응답 body 에 `"role": "SYSTEM_SYNC"` 포함
- [ ] 잘못된 비밀번호 → 401
- [ ] 존재하지 않는 loginId → 401 (메시지가 비밀번호 오류와 동일해야 사용자 열거 공격 방지)
- [ ] 쿠키 없이 보호된 API 호출 → 401
- [ ] 쿠키 첨부하면 통과
- [ ] 세션 timeout(30분) 후 쿠키 무효화 → 401

### Ticket API
- [ ] 200 응답하면 송신 측 DB `qa_sync_status` 가 1 → 2 로 변경됨
- [ ] 500 응답하면 송신 측이 5분 후 자동 재시도
- [ ] 한글/개행 포함 `errorBug` 가 DB 에 그대로 저장 (UTF-8)
- [ ] 같은 payload 가 두 번 도착해도 ticket 이 중복 생성되지 않음 (멱등 처리 적용 시)
- [ ] 송신 측이 세션 만료 후 자동 재로그인 → 재시도 → 성공

---

## Part E. 변경 이력

| 일자 | 내용 |
|---|---|
| 2026-05-14 | 최초 작성 (V1, SSO 기반) |
| 2026-05-14 | V2 — SSO 제거, 로컬 계정(`system`) 세션 쿠키 방식으로 전면 변경. Part A(로컬 로그인 시스템 구축 가이드) 추가 |
| 2026-05-14 | V3 — 정보 구조 개선. `dts_local_roles` 테이블 추가 (SSO 역할과 분리). 로컬 계정 PK 시퀀스를 1000번 시작으로 변경. `CurrentUser` 에 역할 정보 포함. DB 마이그레이션 파일 번호 정리 (V1~V3) |
