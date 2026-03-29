package com.manuhddev.calendario.dto;

import lombok.*;

import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventoResumenDTO {
    private Long id;
    private String titulo;
    private LocalDate fechaInicio;
    private LocalDate fechaFin;
    private String color;
}
