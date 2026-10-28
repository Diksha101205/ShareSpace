package edu.sharespace;

import jakarta.servlet.http.HttpServletRequest;import org.springframework.dao.DataIntegrityViolationException;import org.springframework.http.HttpStatus;import org.springframework.http.ResponseEntity;import org.springframework.validation.FieldError;import org.springframework.http.converter.HttpMessageNotReadableException;import org.springframework.web.bind.MethodArgumentNotValidException;import org.springframework.web.bind.annotation.ExceptionHandler;import org.springframework.web.bind.annotation.RestControllerAdvice;import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;import java.util.*;

record ApiError(Instant timestamp,int status,String error,String message,String path,Map<String,String> fields){}
@RestControllerAdvice class ApiErrors {
 @ExceptionHandler(ResponseStatusException.class) ResponseEntity<ApiError> status(ResponseStatusException ex,HttpServletRequest request){HttpStatus s=HttpStatus.valueOf(ex.getStatusCode().value());return ResponseEntity.status(s).body(new ApiError(Instant.now(),s.value(),s.getReasonPhrase(),ex.getReason(),request.getRequestURI(),Map.of()));}
 @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<ApiError> validation(MethodArgumentNotValidException ex,HttpServletRequest request){Map<String,String> fields=new TreeMap<>();for(FieldError e:ex.getBindingResult().getFieldErrors())fields.putIfAbsent(e.getField(),e.getDefaultMessage());return ResponseEntity.badRequest().body(new ApiError(Instant.now(),400,"Bad Request","Request validation failed",request.getRequestURI(),fields));}
 @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException ex,HttpServletRequest request){return ResponseEntity.badRequest().body(new ApiError(Instant.now(),400,"Bad Request","Malformed JSON or invalid enum/date value",request.getRequestURI(),Map.of()));}
 @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<ApiError> integrity(DataIntegrityViolationException ex,HttpServletRequest request){return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError(Instant.now(),409,"Conflict","The request conflicts with an existing database constraint",request.getRequestURI(),Map.of()));}
}
