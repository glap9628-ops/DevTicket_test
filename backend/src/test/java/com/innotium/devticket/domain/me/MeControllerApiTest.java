package com.innotium.devticket.domain.me;

import com.innotium.devticket.common.auth.AuthInterceptor;
import com.innotium.devticket.common.config.WebMvcConfig;
import com.innotium.devticket.common.exception.GlobalExceptionHandler;
import com.innotium.devticket.support.ApiHarnessSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MeController.class)
@Import({WebMvcConfig.class, AuthInterceptor.class, GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "app.auth.enabled=true",
        "app.role.developer-group-ids=1,2"
})
@DisplayName("MeController API harness")
class MeControllerApiTest extends ApiHarnessSupport {

    @Test
    @DisplayName("GET /me exposes current user from auth interceptor")
    void me() throws Exception {
        mockMvc.perform(developer(get("/me")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(2))
                .andExpect(jsonPath("$.data.username").value("dev.user"))
                .andExpect(jsonPath("$.data.displayName").value("Developer User"))
                .andExpect(jsonPath("$.data.role").value("DEVELOPER"))
                .andExpect(jsonPath("$.data.groupId").value(2));
    }

    @Test
    @DisplayName("GET /me requires auth headers")
    void unauthorizedWithoutHeaders() throws Exception {
        mockMvc.perform(get("/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.statusCode").value(401));
    }
}
