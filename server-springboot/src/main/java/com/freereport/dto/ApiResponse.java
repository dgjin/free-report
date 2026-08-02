package com.freereport.dto;
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

/**
 * 统一 API 响应封装。
 * 所有接口均通过此类包装返回结果，保持响应格式一致性。
 *
 * @param <T> 响应数据类型
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ApiResponse<T> {
    /** 响应消息，成功时为 "success" */
    private String message;
    /** 响应数据体 */
    private T data;

    /**
     * 快捷构建成功响应。
     *
     * @param data 响应数据
     * @return message 为 "success" 的成功响应
     */
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>("success", data);
    }

    /**
     * 构建自定义消息的响应。
     *
     * @param message 响应消息
     * @param data    响应数据
     * @return 自定义响应
     */
    public static <T> ApiResponse<T> of(String message, T data) {
        return new ApiResponse<>(message, data);
    }
}
