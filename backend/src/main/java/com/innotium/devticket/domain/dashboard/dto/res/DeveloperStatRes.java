package com.innotium.devticket.domain.dashboard.dto.res;

import lombok.Data;

@Data
public class DeveloperStatRes {
    private Long assigneeId;
    private String assigneeName;
    private int inProgressCount;
    private int doneCount;
}
