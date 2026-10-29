package edu.sharespace;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Map;

@Configuration
public class ApiConfig implements WebMvcConfigurer {
    private static final Logger log = LoggerFactory.getLogger(ApiConfig.class);

    @Value("${app.cors-origin}")
    String origin;

    @Value("${app.firebase.project-id:}")
    String firebaseProjectId;

    @PostConstruct
    void reportFirebaseConfiguration() {
        if (firebaseProjectId == null || firebaseProjectId.isBlank()) {
            log.warn("Firebase Admin is disabled because FIREBASE_PROJECT_ID is not configured; protected API requests cannot verify Firebase tokens.");
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(
                        "https://share-space-xi.vercel.app/"
                )
                .allowedMethods(
                        "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"
                )
                .allowedHeaders("*")
                .maxAge(3600);
    }

    @Bean
    FirebaseTokenFilter firebaseTokenFilter(ObjectProvider<FirebaseAuth> firebaseAuth,
                                             FirebaseUserProvisioner provisioner,
                                             ObjectMapper objectMapper) {
        return new FirebaseTokenFilter(firebaseAuth, provisioner, objectMapper);
    }

    @Bean
    FilterRegistrationBean<FirebaseTokenFilter> disableContainerFilterRegistration(FirebaseTokenFilter tokenFilter) {
        FilterRegistrationBean<FirebaseTokenFilter> registration = new FilterRegistrationBean<>(tokenFilter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    UserDetailsService firebaseOnlyUserDetailsService() {
        return username -> { throw new UsernameNotFoundException("Firebase bearer authentication is required"); };
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http, FirebaseTokenFilter tokenFilter,
                                 ObjectMapper objectMapper) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> writeError(
                                objectMapper, request, response, HttpStatus.UNAUTHORIZED, "Authentication required"))
                        .accessDeniedHandler((request, response, exception) -> writeError(
                                objectMapper, request, response, HttpStatus.FORBIDDEN, "Access denied")))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/health", "/api/resources", "/api/resources/**").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(tokenFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private void writeError(ObjectMapper mapper, jakarta.servlet.http.HttpServletRequest request,
                            jakarta.servlet.http.HttpServletResponse response,
                            HttpStatus status, String message) throws java.io.IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(), Map.of(
                "timestamp", Instant.now().toString(),
                "status", status.value(),
                "error", status.getReasonPhrase(),
                "message", message,
                "path", request.getRequestURI(),
                "fields", Map.of()));
    }
}
