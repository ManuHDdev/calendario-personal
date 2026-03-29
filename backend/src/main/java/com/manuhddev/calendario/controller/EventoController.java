package com.manuhddev.calendario.controller;

import com.manuhddev.calendario.dto.EventoRequestDTO;
import com.manuhddev.calendario.dto.EventoResponseDTO;
import com.manuhddev.calendario.dto.EventoResumenDTO;
import com.manuhddev.calendario.service.EventoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/eventos")
@Validated
@RequiredArgsConstructor
@Tag(name = "Eventos", description = "Gestión de eventos del calendario")
public class EventoController {

    private final EventoService eventoService;

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Listar eventos: por año, mes opcional, búsqueda y filtro de color")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Lista de eventos"),
            @ApiResponse(responseCode = "401", description = "No autenticado")
    })
    public ResponseEntity<List<EventoResumenDTO>> getEventos(
            @RequestParam int anio,
            @RequestParam(required = false) Integer mes,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String color) {
        if (q != null || color != null) {
            return ResponseEntity.ok(eventoService.buscarEventos(anio, mes, q, color));
        }
        if (mes != null) {
            return ResponseEntity.ok(eventoService.getEventosByMes(anio, mes));
        }
        return ResponseEntity.ok(eventoService.getEventosByAnio(anio));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Obtener detalle de un evento")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Evento encontrado"),
            @ApiResponse(responseCode = "401", description = "No autenticado"),
            @ApiResponse(responseCode = "404", description = "Evento no encontrado")
    })
    public ResponseEntity<EventoResponseDTO> getEventoById(@PathVariable Long id) {
        return ResponseEntity.ok(eventoService.getEventoById(id));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Crear nuevo evento")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Evento creado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos"),
            @ApiResponse(responseCode = "401", description = "No autenticado")
    })
    public ResponseEntity<EventoResponseDTO> createEvento(@RequestBody @Valid EventoRequestDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(eventoService.createEvento(dto));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Modificar evento existente")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Evento actualizado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos"),
            @ApiResponse(responseCode = "401", description = "No autenticado"),
            @ApiResponse(responseCode = "404", description = "Evento no encontrado")
    })
    public ResponseEntity<EventoResponseDTO> updateEvento(@PathVariable Long id,
                                                           @RequestBody @Valid EventoRequestDTO dto) {
        return ResponseEntity.ok(eventoService.updateEvento(id, dto));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Eliminar evento (borrado lógico)")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Evento eliminado"),
            @ApiResponse(responseCode = "401", description = "No autenticado"),
            @ApiResponse(responseCode = "404", description = "Evento no encontrado")
    })
    public ResponseEntity<Void> deleteEvento(@PathVariable Long id) {
        eventoService.deleteEvento(id);
        return ResponseEntity.noContent().build();
    }
}
