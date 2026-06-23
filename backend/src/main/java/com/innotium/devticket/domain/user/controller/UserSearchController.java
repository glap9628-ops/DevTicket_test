package com.innotium.devticket.domain.user.controller;

import com.innotium.devticket.common.response.ApiResponse;
import com.innotium.devticket.domain.user.dto.UserSearchRes;
import com.innotium.devticket.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserSearchController {

    private final UserRepository userRepository;

    /**
     * GET /devticket/api/users/search?q={keyword}
     * @멘션 자동완성용. q가 2자 미만이면 빈 목록 반환.
     */
    @GetMapping("/search")
    public ApiResponse<List<UserSearchRes>> search(@RequestParam(defaultValue = "") String q) {
        if (q.length() < 2) {
            return ApiResponse.ok(List.of());
        }
        return ApiResponse.ok(userRepository.searchUsers(q));
    }

    /**
     * GET /devticket/api/users/developers
     * 담당자 지정 드롭다운용: 개발자 그룹(group_id 1,2) 전체 활성 사용자 목록 반환.
     */
    @GetMapping("/developers")
    public ApiResponse<List<UserSearchRes>> developers() {
        return ApiResponse.ok(userRepository.findDeveloperUsers());
    }
}
