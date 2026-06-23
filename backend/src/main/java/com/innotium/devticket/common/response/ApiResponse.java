package com.innotium.devticket.common.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {

    private int statusCode;
    private String message;
    private T data;
    private String detail;

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(200, "SERVER.MESSAGE.SUCCESS", data, null);
    }

    public static ApiResponse<?> ok() {
        return new ApiResponse<>(200, "SERVER.MESSAGE.SUCCESS", null, null);
    }

    public static <T> ApiResponse<T> okMessage(String messageKey, T data) {
        return new ApiResponse<>(200, messageKey, data, null);
    }

    public static ApiResponse<?> okMessage(String messageKey) {
        return new ApiResponse<>(200, messageKey, null, null);
    }

    public static ApiResponse<?> error(int statusCode, String messageKey) {
        return new ApiResponse<>(statusCode, messageKey, null, null);
    }

    public static ApiResponse<?> error(int statusCode, String messageKey, String detail) {
        return new ApiResponse<>(statusCode, messageKey, null, detail);
    }
}
