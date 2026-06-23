package com.innotium.devticket.domain.dashboard.service;

import com.innotium.devticket.domain.dashboard.dto.res.DashboardRes;
import com.innotium.devticket.domain.dashboard.dto.res.DeveloperStatRes;
import com.innotium.devticket.domain.dashboard.dto.res.RecentActivityRes;
import com.innotium.devticket.domain.dashboard.repository.DashboardRepository;
import com.innotium.devticket.domain.ticket.dto.res.TicketSummaryRes;
import com.innotium.devticket.domain.ticket.model.TicketStatus;
import com.innotium.devticket.domain.ticket.model.TicketType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final DashboardRepository dashboardRepository;

    @Transactional(readOnly = true)
    public DashboardRes getDashboard(Integer year, Integer month) {
        Map<String, Object> params = new HashMap<>();
        // null 대신 0으로 전달 → XML에서 "> 0" 조건 사용 (OGNL null 체크 불안정 방지)
        params.put("year",  year  != null ? year  : 0);
        params.put("month", month != null ? month : 0);

        DashboardRes res = new DashboardRes();

        // Status counts
        Map<String, Integer> statusCounts = new HashMap<>();
        statusCounts.put("PENDING_REVIEW", 0);
        statusCounts.put("READY", 0);  // 검토완료(2) → 진행가능(3) 통합
        statusCounts.put("IN_PROGRESS", 0);
        statusCounts.put("QA_REVIEW", 0);
        statusCounts.put("DONE", 0);
        statusCounts.put("ON_HOLD", 0);
        statusCounts.put("REJECTED", 0);

        List<Map<String, Object>> rawStatusCounts = dashboardRepository.selectStatusCounts(params);
        for (Map<String, Object> row : rawStatusCounts) {
            Object statusObj = row.get("status");
            Object cntObj = row.get("cnt");
            if (statusObj != null && cntObj != null) {
                int statusCode = ((Number) statusObj).intValue();
                int cnt = ((Number) cntObj).intValue();
                try {
                    TicketStatus ticketStatus = TicketStatus.fromCode(statusCode);
                    statusCounts.put(ticketStatus.name(), cnt);
                } catch (IllegalArgumentException ignored) {
                }
            }
        }
        res.setStatusCounts(statusCounts);

        // Type counts
        Map<String, Integer> typeCounts = new HashMap<>();
        typeCounts.put("QA", 0);
        typeCounts.put("DEVOPS", 0);
        typeCounts.put("DEV", 0);
        typeCounts.put("VENDOR", 0);
        typeCounts.put("MAINTENANCE", 0);

        List<Map<String, Object>> rawTypeCounts = dashboardRepository.selectTypeCounts(params);
        for (Map<String, Object> row : rawTypeCounts) {
            Object typeObj = row.get("ticket_type");
            Object cntObj = row.get("cnt");
            if (typeObj != null && cntObj != null) {
                int typeCode = ((Number) typeObj).intValue();
                int cnt = ((Number) cntObj).intValue();
                try {
                    TicketType ticketType = TicketType.fromCode(typeCode);
                    typeCounts.put(ticketType.name(), cnt);
                } catch (IllegalArgumentException ignored) {
                }
            }
        }
        res.setTypeCounts(typeCounts);

        // Product counts
        Map<String, Integer> productCounts = new java.util.LinkedHashMap<>();
        List<Map<String, Object>> rawProductCounts = dashboardRepository.selectProductCounts(params);
        for (Map<String, Object> row : rawProductCounts) {
            if (row == null) continue; // MyBatis가 NULL 행을 null로 반환하는 경우 방어
            Object nameObj = row.get("product_name");
            Object cntObj  = row.get("cnt");
            if (nameObj != null && cntObj != null) {
                productCounts.put(String.valueOf(nameObj), ((Number) cntObj).intValue());
            }
        }
        res.setProductCounts(productCounts);

        // Delayed tickets
        List<TicketSummaryRes> delayedTickets = dashboardRepository.selectDelayedTickets(params);
        res.setDelayedTickets(delayedTickets);

        // Developer stats
        List<DeveloperStatRes> developerStats = dashboardRepository.selectDeveloperStats(params);
        res.setDeveloperStats(developerStats);

        // Urgent count
        int urgentCount = dashboardRepository.selectUrgentCount(params);
        res.setUrgentCount(urgentCount);

        // Recent activities
        List<RecentActivityRes> recentActivities = dashboardRepository.selectRecentActivities();
        res.setRecentActivities(recentActivities);

        return res;
    }
}
