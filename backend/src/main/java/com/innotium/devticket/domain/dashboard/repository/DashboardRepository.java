package com.innotium.devticket.domain.dashboard.repository;

import com.innotium.devticket.domain.dashboard.dto.res.DeveloperStatRes;
import com.innotium.devticket.domain.dashboard.dto.res.RecentActivityRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketSummaryRes;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.Map;

@Mapper
public interface DashboardRepository {

    List<Map<String, Object>> selectStatusCounts(Map<String, Object> params);

    List<Map<String, Object>> selectTypeCounts(Map<String, Object> params);

    List<TicketSummaryRes> selectDelayedTickets(Map<String, Object> params);

    List<DeveloperStatRes> selectDeveloperStats(Map<String, Object> params);

    List<Map<String, Object>> selectProductCounts(Map<String, Object> params);

    int selectUrgentCount(Map<String, Object> params);

    List<RecentActivityRes> selectRecentActivities();
}
