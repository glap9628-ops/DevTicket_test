package com.innotium.devticket.domain.user.dto;

import lombok.Data;

@Data
public class UserSearchRes {
    private Long userId;
    private String username;
    private String displayName;
    private String groupName;
}
