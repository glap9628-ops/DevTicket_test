package com.innotium.devticket.common.auth;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class CurrentUser {
    private final Long id;
    private final String username;
    private final String displayName;
    private final String role;  // ADMIN / DEVELOPER / REQUESTER
    private final Integer groupId;
    private final String groupName;
}
