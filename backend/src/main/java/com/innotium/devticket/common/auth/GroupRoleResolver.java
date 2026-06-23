package com.innotium.devticket.common.auth;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 애플리케이션 시작 시 groups 테이블에서 개발자(DEVELOPER) 로 매핑할 그룹 ID를 로드한다.
 *
 * 매핑 기준: groups.name 이 다음 키워드를 포함하는 그룹
 *   - 기술연구소
 *   - DevOps (대소문자 무관)
 *
 * group_id 가 숫자로 고정되지 않아도 되므로 SSO 동기화로 ID가 바뀌어도 자동 반영된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GroupRoleResolver {

    private final JdbcTemplate jdbcTemplate;

    /** 개발자 그룹 ID 캐시 (앱 시작 시 1회 로드) */
    private Set<Integer> developerGroupIds = new HashSet<>();

    @PostConstruct
    public void init() {
        try {
            List<Integer> ids = jdbcTemplate.queryForList(
                "SELECT id FROM groups WHERE name LIKE '%기술연구소%' OR name ILIKE '%devops%'",
                Integer.class
            );
            developerGroupIds = new HashSet<>(ids);
            log.info("[GroupRoleResolver] Developer group IDs loaded: {}", developerGroupIds);
        } catch (Exception e) {
            // groups 테이블 미존재 등 예외 시 기존 기본값(1, 2) 사용
            developerGroupIds = new HashSet<>(List.of(1, 2));
            log.warn("[GroupRoleResolver] Failed to load developer group IDs from DB, using fallback {}: {}",
                developerGroupIds, e.getMessage());
        }
    }

    /**
     * 주어진 groupId 가 DEVELOPER 그룹인지 반환한다.
     */
    public boolean isDeveloperGroup(Integer groupId) {
        return groupId != null && developerGroupIds.contains(groupId);
    }
}
