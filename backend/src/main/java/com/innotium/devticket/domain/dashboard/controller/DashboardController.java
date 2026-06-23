package com.innotium.devticket.domain.dashboard.controller;

import com.innotium.devticket.common.response.ApiResponse;
import com.innotium.devticket.domain.dashboard.dto.res.DashboardRes;
import com.innotium.devticket.domain.dashboard.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping
    public ApiResponse<DashboardRes> getDashboard(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        return ApiResponse.ok(dashboardService.getDashboard(year, month));
    }
}
