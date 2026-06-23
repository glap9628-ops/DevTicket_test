package com.innotium.devticket.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;

public abstract class ApiHarnessSupport {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    protected MockHttpServletRequestBuilder admin(MockHttpServletRequestBuilder builder) {
        return authenticated(builder, "1", "admin", "Admin User", "admin", "1");
    }

    protected MockHttpServletRequestBuilder developer(MockHttpServletRequestBuilder builder) {
        return authenticated(builder, "2", "dev.user", "Developer User", "user", "2");
    }

    protected MockHttpServletRequestBuilder requester(MockHttpServletRequestBuilder builder) {
        return authenticated(builder, "3", "req.user", "Requester User", "user", "3");
    }

    protected String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize test payload", e);
        }
    }

    private MockHttpServletRequestBuilder authenticated(
            MockHttpServletRequestBuilder builder,
            String userId,
            String username,
            String displayName,
            String role,
            String groupId
    ) {
        return builder
                .header("X-ERP-User-Id", userId)
                .header("X-ERP-User-Username", username)
                .header("X-ERP-Display-Name", encode(displayName))
                .header("X-ERP-User-Role", role)
                .header("X-ERP-User-Group-Id", groupId);
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
