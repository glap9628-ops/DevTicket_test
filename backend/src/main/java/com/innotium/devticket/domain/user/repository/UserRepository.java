package com.innotium.devticket.domain.user.repository;

import com.innotium.devticket.domain.user.dto.UserSearchRes;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserRepository {

    /** @멘션 파싱용: username으로 활성 사용자 ID 조회 */
    Long findActiveIdByUsername(@Param("username") String username);

    /** 자동완성용: username/displayName ILIKE 검색 */
    List<UserSearchRes> searchUsers(@Param("q") String q);

    /** 신규 티켓 알림 대상: 기술연구소팀 + 관리자 활성 사용자 ID 목록 */
    List<Long> findDeveloperIds();

    /** 담당자 지정 드롭다운용: 개발자 그룹(group_id 1,2) 전체 목록 */
    List<UserSearchRes> findDeveloperUsers();

    /** ID로 단일 사용자 조회 (없으면 null) */
    UserSearchRes findUserById(@Param("id") Long id);

    /** group_id로 그룹명 조회 (없으면 null) */
    String findGroupNameByGroupId(@Param("groupId") Integer groupId);
}
