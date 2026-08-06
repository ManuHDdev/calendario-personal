package com.manuhddev.calendario.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manuhddev.calendario.dto.EventoRequestDTO;
import com.manuhddev.calendario.repository.EventoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Testcontainers
@Import(TestSecurityConfig.class)
class EventoControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
        // Prevent OIDC discovery at startup; actual JWT decoding is mocked via TestSecurityConfig
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri",
                () -> "http://localhost:8080/realms/calendario");
    }

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired EventoRepository eventoRepository;

    @BeforeEach
    void setUp() {
        eventoRepository.deleteAll();
    }

    private EventoRequestDTO eventoValido() {
        return EventoRequestDTO.builder()
                .titulo("Evento Test").fechaInicio(LocalDate.of(2025, 6, 1))
                .color("#0071e3").build();
    }

    @Test
    @WithMockUser(roles = "admin")
    void postEvento_datosValidos_devuelve201() throws Exception {
        mockMvc.perform(post("/api/eventos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(eventoValido())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.titulo").value("Evento Test"));
    }

    @Test
    @WithMockUser(roles = "admin")
    void postEvento_sinTitulo_devuelve400() throws Exception {
        EventoRequestDTO dto = EventoRequestDTO.builder()
                .fechaInicio(LocalDate.of(2025, 6, 1)).color("#0071e3").build();
        mockMvc.perform(post("/api/eventos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(roles = "admin")
    void postEvento_fechaFinAntesFechaInicio_devuelve500() throws Exception {
        EventoRequestDTO dto = EventoRequestDTO.builder()
                .titulo("Test").fechaInicio(LocalDate.of(2025, 6, 10))
                .fechaFin(LocalDate.of(2025, 6, 1)).color("#0071e3").build();
        mockMvc.perform(post("/api/eventos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().is5xxServerError());
    }

    @Test
    @WithMockUser(roles = "admin")
    void getEventosByAnio_devuelve200() throws Exception {
        mockMvc.perform(get("/api/eventos").param("anio", "2025"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    @WithMockUser(roles = "admin")
    void getEventoById_existente_devuelve200() throws Exception {
        String body = mockMvc.perform(post("/api/eventos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(eventoValido())))
                .andReturn().getResponse().getContentAsString();
        Long id = objectMapper.readTree(body).get("id").asLong();

        mockMvc.perform(get("/api/eventos/{id}", id))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "admin")
    void getEventoById_inexistente_devuelve404() throws Exception {
        mockMvc.perform(get("/api/eventos/9999"))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(roles = "admin")
    void putEvento_devuelve200() throws Exception {
        String body = mockMvc.perform(post("/api/eventos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(eventoValido())))
                .andReturn().getResponse().getContentAsString();
        Long id = objectMapper.readTree(body).get("id").asLong();

        EventoRequestDTO update = EventoRequestDTO.builder()
                .titulo("Actualizado").fechaInicio(LocalDate.of(2025, 7, 1)).color("#ff0000").build();
        mockMvc.perform(put("/api/eventos/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titulo").value("Actualizado"));
    }

    @Test
    @WithMockUser(roles = "admin")
    void deleteEvento_devuelve204_yGetPosteriorDevuelve404() throws Exception {
        String body = mockMvc.perform(post("/api/eventos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(eventoValido())))
                .andReturn().getResponse().getContentAsString();
        Long id = objectMapper.readTree(body).get("id").asLong();

        mockMvc.perform(delete("/api/eventos/{id}", id))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/eventos/{id}", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void sinAutenticacion_devuelve401() throws Exception {
        mockMvc.perform(get("/api/eventos").param("anio", "2025"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "familia")
    void conRolNoAdmin_devuelve403() throws Exception {
        mockMvc.perform(get("/api/eventos").param("anio", "2025"))
                .andExpect(status().isForbidden());
    }
}
