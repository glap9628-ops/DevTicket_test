package com.innotium.devticket.domain.ticket.controller;

import com.innotium.devticket.common.auth.AuthInterceptor;
import com.innotium.devticket.common.config.WebMvcConfig;
import com.innotium.devticket.common.exception.FailException;
import com.innotium.devticket.common.exception.GlobalExceptionHandler;
import com.innotium.devticket.domain.ticket.dto.req.TicketCreateReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketPickupReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketStatusChangeReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketUpdateReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketUrgentReq;
import com.innotium.devticket.domain.ticket.dto.res.TicketListRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketSummaryRes;
import com.innotium.devticket.domain.ticket.service.TicketService;
import com.innotium.devticket.support.ApiHarnessSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TicketController.class)
@Import({WebMvcConfig.class, AuthInterceptor.class, GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "app.auth.enabled=true",
        "app.role.developer-group-ids=1,2"
})
@DisplayName("TicketController API harness")
class TicketControllerApiTest extends ApiHarnessSupport {

    @MockBean
    private TicketService ticketService;

    @Test
    @DisplayName("POST /tickets creates a ticket with authenticated requester headers")
    void createTicket() throws Exception {
        TicketCreateReq req = new TicketCreateReq();
        req.setTicketType(3);
        req.setTitle("Login issue");
        req.setIsUrgent(true);
        req.setProductName("Portal");
        req.setExtraFields(Map.of("browser", "Chrome"));

        TicketRes res = ticketRes(101L, "DEV-0101", 0);
        given(ticketService.createTicket(any(TicketCreateReq.class), any())).willReturn(res);

        mockMvc.perform(requester(post("/tickets"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.statusCode").value(200))
                .andExpect(jsonPath("$.data.id").value(101))
                .andExpect(jsonPath("$.data.ticketNo").value("DEV-0101"))
                .andExpect(jsonPath("$.data.productName").value("Portal"))
                .andExpect(jsonPath("$.data.requesterName").value("Requester User"));

        then(ticketService).should().createTicket(any(TicketCreateReq.class), any());
    }

    @Test
    @DisplayName("GET /tickets returns paged list payload")
    void getTicketList() throws Exception {
        TicketSummaryRes summary = new TicketSummaryRes();
        summary.setId(11L);
        summary.setTicketNo("QA-0011");
        summary.setTitle("QA check");
        summary.setStatus(0);
        summary.setProductName("Backoffice");
        summary.setRequesterName("Requester User");

        given(ticketService.getTicketList(any())).willReturn(new TicketListRes(List.of(summary), 1, 1, 20));

        mockMvc.perform(developer(get("/tickets?page=1&size=20&status=0&productName=Backoffice")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCount").value(1))
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.content[0].ticketNo").value("QA-0011"))
                .andExpect(jsonPath("$.data.content[0].productName").value("Backoffice"));
    }

    @Test
    @DisplayName("GET /tickets/{id} returns ticket detail")
    void getTicket() throws Exception {
        given(ticketService.getTicket(7L)).willReturn(ticketRes(7L, "DEV-0007", 2));

        mockMvc.perform(admin(get("/tickets/7")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(7))
                .andExpect(jsonPath("$.data.status").value(2))
                .andExpect(jsonPath("$.data.productName").value("Portal"));
    }

    @Test
    @DisplayName("PATCH /tickets/{id} updates ticket")
    void updateTicket() throws Exception {
        TicketUpdateReq req = new TicketUpdateReq();
        req.setTitle("Updated title");
        req.setIsUrgent(false);
        req.setProductName("Backoffice");
        req.setExtraFields(Map.of("priority", "medium"));

        given(ticketService.updateTicket(eq(5L), any(TicketUpdateReq.class), any()))
                .willReturn(ticketRes(5L, "DEV-0005", 1));

        mockMvc.perform(requester(patch("/tickets/5"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ticketNo").value("DEV-0005"))
                .andExpect(jsonPath("$.data.productName").value("Portal"));
    }

    @Test
    @DisplayName("PUT /tickets/{id}/status changes ticket status")
    void changeStatus() throws Exception {
        TicketStatusChangeReq req = new TicketStatusChangeReq();
        req.setStatus(2);
        req.setReason("QA ready");

        given(ticketService.changeStatus(eq(5L), any(TicketStatusChangeReq.class), any()))
                .willReturn(ticketRes(5L, "DEV-0005", 2));

        mockMvc.perform(developer(put("/tickets/5/status"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(2));
    }

    @Test
    @DisplayName("PUT /tickets/{id}/pickup blocks requester before service layer")
    void pickupForbiddenForRequester() throws Exception {
        TicketPickupReq req = new TicketPickupReq();
        req.setReason("I will take this");

        mockMvc.perform(requester(put("/tickets/5/pickup"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.statusCode").value(403))
                .andExpect(jsonPath("$.data").value(nullValue()));
    }

    @Test
    @DisplayName("PUT /tickets/{id}/pickup allows developer")
    void pickupAsDeveloper() throws Exception {
        TicketPickupReq req = new TicketPickupReq();
        req.setReason("Start now");

        given(ticketService.pickupTicket(eq(5L), any(TicketPickupReq.class), any()))
                .willReturn(ticketRes(5L, "DEV-0005", 1));

        mockMvc.perform(developer(put("/tickets/5/pickup"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(1));
    }

    @Test
    @DisplayName("DELETE /tickets/{id}/pickup cancels assignment")
    void cancelPickup() throws Exception {
        given(ticketService.cancelPickup(eq(5L), any())).willReturn(ticketRes(5L, "DEV-0005", 0));

        mockMvc.perform(developer(delete("/tickets/5/pickup")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(0));
    }

    @Test
    @DisplayName("PUT /tickets/{id}/urgent updates urgent flag")
    void updateUrgentAsAdmin() throws Exception {
        TicketUrgentReq req = new TicketUrgentReq();
        req.setIsUrgent(true);

        TicketRes res = ticketRes(5L, "DEV-0005", 1);
        res.setIsUrgent(true);
        given(ticketService.updateUrgent(eq(5L), eq(true), any())).willReturn(res);

        mockMvc.perform(admin(put("/tickets/5/urgent"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isUrgent").value(true));
    }

    @Test
    @DisplayName("PUT /tickets/{id}/urgent returns forbidden for non-admin users")
    void updateUrgentForbiddenForDeveloper() throws Exception {
        TicketUrgentReq req = new TicketUrgentReq();
        req.setIsUrgent(true);

        given(ticketService.updateUrgent(eq(5L), eq(true), any()))
                .willThrow(new FailException(HttpStatus.FORBIDDEN, "ADMIN_ONLY"));

        mockMvc.perform(developer(put("/tickets/5/urgent"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.statusCode").value(403))
                .andExpect(jsonPath("$.message").value("ADMIN_ONLY"));
    }

    @Test
    @DisplayName("All ticket endpoints require auth headers")
    void unauthorizedWithoutHeaders() throws Exception {
        mockMvc.perform(get("/tickets"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.statusCode").value(401))
                .andExpect(jsonPath("$.message").exists());
    }

    private TicketRes ticketRes(Long id, String ticketNo, Integer status) {
        TicketRes res = new TicketRes();
        res.setId(id);
        res.setTicketNo(ticketNo);
        res.setTicketType(3);
        res.setTitle("Test ticket");
        res.setStatus(status);
        res.setIsUrgent(false);
        res.setProductName("Portal");
        res.setRequesterId(3L);
        res.setRequesterName("Requester User");
        res.setAssigneeId(2L);
        res.setAssigneeName("Developer User");
        res.setExtraFields(Map.of("source", "api-test"));
        res.setCreatedAt(OffsetDateTime.parse("2026-04-06T09:00:00+09:00"));
        res.setUpdatedAt(OffsetDateTime.parse("2026-04-06T10:00:00+09:00"));
        return res;
    }
}
