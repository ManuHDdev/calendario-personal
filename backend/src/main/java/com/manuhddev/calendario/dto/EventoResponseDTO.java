package com.manuhddev.calendario.dto;

import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventoResponseDTO {
    private Long id;
    private String titulo;
    private String descripcion;
    private LocalDate fechaInicio;
    private LocalDate fechaFin;
    private LocalTime horaInicio;
    private LocalTime horaFin;
    private String color;
    private boolean activo;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<ImagenEventoResponseDTO> imagenes;
}
