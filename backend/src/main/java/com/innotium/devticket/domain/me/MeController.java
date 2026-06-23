package com.innotium.devticket.domain.me;

import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.auth.UserContextHolder;
import com.innotium.devticket.common.response.ApiResponse;
import com.innotium.devticket.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/me")
@RequiredArgsConstructor
public class MeController {

    private final UserRepository userRepository;

    /** /me 응답 DTO — CurrentUser + DB에서 조회한 groupName 포함 */
    record MeRes(
        Long    id,
        String  username,
        String  displayName,
        String  role,
        Integer groupId,
        String  groupName
    ) {}

    @GetMapping
    public ApiResponse<MeRes> me() {
        CurrentUser user = UserContextHolder.get();

        // groupName: 헤더에서 온 값이 있으면 사용, 없으면 DB 직접 조회
        String groupName = user.getGroupName();
        if ((groupName == null || groupName.isBlank()) && user.getGroupId() != null) {
            try {
                groupName = userRepository.findGroupNameByGroupId(user.getGroupId());
            } catch (Exception ignored) {
                groupName = "";
            }
        }

        return ApiResponse.ok(new MeRes(
            user.getId(),
            user.getUsername(),
            user.getDisplayName(),
            user.getRole(),
            user.getGroupId(),
            groupName != null ? groupName : ""
        ));
    }
}
