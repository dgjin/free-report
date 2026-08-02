package com.freereport.exception;

import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.ResponseEntity;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 业务异常：按 DomainException 携带的 statusCode 返回，403/409 记录审计日志 */
    @ExceptionHandler(DomainException.class)
    public ResponseEntity<Map<String, String>> handleDomainException(DomainException e) {
        if (e.getStatusCode() >= 403) {
            log.warn("业务拒绝 [{}]: {}", e.getStatusCode(), e.getMessage());
        }
        return ResponseEntity.status(e.getStatusCode())
                .body(Map.of("error", e.getMessage()));
    }

    /** 参数校验失败（@Valid Bean Validation）→ 400 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationException(MethodArgumentNotValidException e) {
        String errors = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.status(400)
                .body(Map.of("error", "参数校验失败: " + errors));
    }

    /** 请求体不可读（JSON 格式错误/缺失）→ 400 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleHttpMessageNotReadable(HttpMessageNotReadableException e) {
        return ResponseEntity.status(400)
                .body(Map.of("error", "请求体格式错误或缺失"));
    }

    /** 路径参数类型不匹配（如 id 传入非数字）→ 400 */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        return ResponseEntity.status(400)
                .body(Map.of("error", "参数类型不匹配: " + e.getName()));
    }

    /** 请求必填参数缺失 → 400 */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> handleMissingParam(MissingServletRequestParameterException e) {
        return ResponseEntity.status(400)
                .body(Map.of("error", "缺少必填参数: " + e.getParameterName()));
    }

    /** 兜底：未预期的系统异常 → 500，记录完整堆栈便于排查 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleException(Exception e) {
        log.error("未处理异常", e);
        return ResponseEntity.status(500)
                .body(Map.of("error", "服务器内部错误，请稍后重试"));
    }
}
