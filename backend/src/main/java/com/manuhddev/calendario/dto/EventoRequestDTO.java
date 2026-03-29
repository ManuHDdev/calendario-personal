package com.manuhddev.calendario.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventoRequestDTO {

    @NotBlank
    @Size(max = 150)
    private String titulo;

    private String descripcion;

    @NotNull
    private LocalDate fechaInicio;

    private LocalDate fechaFin;

    private LocalTime horaInicio;

    private LocalTime horaFin;

    @NotBlank
    @Pattern(regexp = "^#[0-9A-Fa-f]{6}$")
    private String color;
}
