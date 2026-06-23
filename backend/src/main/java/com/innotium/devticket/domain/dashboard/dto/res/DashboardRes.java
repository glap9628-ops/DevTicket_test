package com.innotium.devticket.domain.dashboard.dto.res;

import com.innotium.devticket.domain.ticket.dto.res.TicketSummaryRes;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class DashboardRes {
    private Map<String, Integer> statusCounts;
    private Map<String, Integer> typeCounts;
    private Map<String, Integer> productCounts;
    private List<TicketSummaryRes> delayedTickets;
    private List<DeveloperStatRes> developerStats;
    private int urgentCount;
    private List<RecentActivityRes> recentActivities;
}
