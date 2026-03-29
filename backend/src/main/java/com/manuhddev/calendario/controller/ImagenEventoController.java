package com.manuhddev.calendario.controller;

import com.manuhddev.calendario.dto.ImagenEventoResponseDTO;
import com.manuhddev.calendario.service.ImagenEventoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/eventos/{eventoId}/imagenes")
@RequiredArgsConstructor
@Tag(name = "Imágenes", description = "Gestión de imágenes adjuntas a eventos")
public class ImagenEventoController {

    private final ImagenEventoService imagenEventoService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Adjuntar imagen a un evento")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Imagen añadida"),
            @ApiResponse(responseCode = "400", description = "Fichero inválido o límite alcanzado"),
            @ApiResponse(responseCode = "401", description = "No autenticado"),
            @ApiResponse(responseCode = "404", description = "Evento no encontrado")
    })
    public ResponseEntity<ImagenEventoResponseDTO> addImagen(
            @PathVariable Long eventoId,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(imagenEventoService.addImagen(eventoId, file));
    }

    @DeleteMapping("/{imagenId}")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Eliminar imagen de un evento")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Imagen eliminada"),
            @ApiResponse(responseCode = "401", description = "No autenticado"),
            @ApiResponse(responseCode = "404", description = "Imagen no encontrada")
    })
    public ResponseEntity<Void> deleteImagen(
            @PathVariable Long eventoId,
            @PathVariable Long imagenId) {
        imagenEventoService.deleteImagen(eventoId, imagenId);
        return ResponseEntity.noContent().build();
    }
}
