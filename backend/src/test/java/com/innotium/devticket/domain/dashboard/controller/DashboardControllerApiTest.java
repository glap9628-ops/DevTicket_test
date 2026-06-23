package com.innotium.devticket.domain.dashboard.controller;

import com.innotium.devticket.common.auth.AuthInterceptor;
import com.innotium.devticket.common.config.WebMvcConfig;
import com.innotium.devticket.common.exception.GlobalExceptionHandler;
import com.innotium.devticket.domain.dashboard.dto.res.DashboardRes;
import com.innotium.devticket.domain.dashboard.dto.res.DeveloperStatRes;
import com.innotium.devticket.domain.dashboard.service.DashboardService;
import com.innotium.devticket.domain.ticket.dto.res.TicketSummaryRes;
import com.innotium.devticket.support.ApiHarnessSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DashboardController.class)
@Import({WebMvcConfig.class, AuthInterceptor.class, GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "app.auth.enabled=true",
        "app.role.developer-group-ids=1,2"
})
@DisplayName("DashboardController API harness")
class DashboardControllerApiTest extends ApiHarnessSupport {

    @MockBean
    private DashboardService dashboardService;

    @Test
    @DisplayName("GET /dashboard returns dashboard aggregate payload")
    void getDashboard() throws Exception {
        DashboardRes res = new DashboardRes();
        res.setStatusCounts(Map.of("WAITING", 3, "IN_PROGRESS", 2, "QA_REVIEW", 1, "DONE", 4));
        res.setTypeCounts(Map.of("QA", 2, "DEVOPS", 1, "DEV", 6, "VENDOR", 1));
        res.setProductCounts(Map.of("Portal", 5, "Backoffice", 3));

        TicketSummaryRes delayed = new TicketSummaryRes();
        delayed.setId(10L);
        delayed.setTicketNo("DEV-0010");
        delayed.setTitle("Deployment failed");
        delayed.setProductName("Portal");
        res.setDelayedTickets(List.of(delayed));

        DeveloperStatRes stat = new DeveloperStatRes();
        stat.setAssigneeId(2L);
        stat.setAssigneeName("Developer User");
        stat.setInProgressCount(2);
        stat.setDoneCount(7);
        res.setDeveloperStats(List.of(stat));

        given(dashboardService.getDashboard(any(), any())).willReturn(res);

        mockMvc.perform(admin(get("/dashboard")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.statusCounts.WAITING").value(3))
                .andExpect(jsonPath("$.data.typeCounts.DEV").value(6))
                .andExpect(jsonPath("$.data.productCounts.Portal").value(5))
                .andExpect(jsonPath("$.data.delayedTickets[0].ticketNo").value("DEV-0010"))
                .andExpect(jsonPath("$.data.delayedTickets[0].productName").value("Portal"))
                .andExpect(jsonPath("$.data.developerStats[0].assigneeName").value("Developer User"));
    }

    @Test
    @DisplayName("GET /dashboard requires auth headers")
    void unauthorizedWithoutHeaders() throws Exception {
        mockMvc.perform(get("/dashboard"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.statusCode").value(401));
    }
}
