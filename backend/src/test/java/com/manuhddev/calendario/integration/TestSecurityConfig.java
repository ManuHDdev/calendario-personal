package com.manuhddev.calendario.integration;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Provides a no-op JwtDecoder for integration tests so the application context
 * can start without a running Keycloak instance. Authentication is handled by
 * @WithMockUser in each test method.
 */
@TestConfiguration
public class TestSecurityConfig {

    @Bean
    public JwtDecoder jwtDecoder() {
        // No-op decoder: integration tests use @WithMockUser, so no real JWT is ever decoded.
        return token -> {
            throw new UnsupportedOperationException("Mock JwtDecoder: use @WithMockUser in tests");
        };
    }
}
