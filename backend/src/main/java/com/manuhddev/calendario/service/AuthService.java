package com.manuhddev.calendario.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class AuthService {

    private final RestTemplate restTemplate;
    private final String issuerUri;

    public AuthService(RestTemplate restTemplate,
                       @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}") String issuerUri) {
        this.restTemplate = restTemplate;
        this.issuerUri = issuerUri;
    }

    public void logout(String bearerToken) {
        String logoutUrl = issuerUri + "/protocol/openid-connect/logout";

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, bearerToken);

        try {
            restTemplate.postForEntity(logoutUrl, new HttpEntity<>(headers), Void.class);
        } catch (RestClientException e) {
            throw new RuntimeException("Error al cerrar sesión en Keycloak: " + e.getMessage(), e);
        }
    }
}
