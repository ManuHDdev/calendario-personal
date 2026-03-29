package com.manuhddev.calendario.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    private static final String ISSUER_URI = "http://localhost:8080/realms/calendario";
    private static final String EXPECTED_LOGOUT_URL = ISSUER_URI + "/protocol/openid-connect/logout";
    private static final String BEARER_TOKEN = "Bearer eyJhbGciOiJSUzI1NiJ9.test";

    @Mock
    private RestTemplate restTemplate;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(restTemplate, ISSUER_URI);
    }

    @Test
    void logout_OK() {
        when(restTemplate.postForEntity(anyString(), any(), eq(Void.class)))
                .thenReturn(ResponseEntity.noContent().build());

        assertDoesNotThrow(() -> authService.logout(BEARER_TOKEN));

        verify(restTemplate).postForEntity(
                eq(EXPECTED_LOGOUT_URL),
                any(),
                eq(Void.class)
        );
    }

    @Test
    void logout_keycloakFalla() {
        when(restTemplate.postForEntity(anyString(), any(), eq(Void.class)))
                .thenThrow(new RestClientException("Keycloak no disponible"));

        assertThrows(RuntimeException.class, () -> authService.logout(BEARER_TOKEN));
    }
}
