package com.freereport.exception;

/**
 * 业务领域异常。
 * 当业务规则校验失败时抛出，携带 HTTP 状态码以区分不同类型的业务拒绝。
 * 由 {@link GlobalExceptionHandler} 统一拦截并转换为 JSON 错误响应。
 */
public class DomainException extends RuntimeException {
    /** HTTP 响应状态码（如 400/403/404/409） */
    private final int statusCode;

    /**
     * 创建业务异常。
     *
     * @param message    错误描述（将作为 API 响应的 error 字段返回给前端）
     * @param statusCode HTTP 状态码
     */
    public DomainException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    /** @return HTTP 响应状态码 */
    public int getStatusCode() {
        return statusCode;
    }
}
