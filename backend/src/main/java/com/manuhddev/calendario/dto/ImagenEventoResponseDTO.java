package com.manuhddev.calendario.dto;

import lombok.*;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ImagenEventoResponseDTO {
    private Long id;
    private String url;
    private String nombreFichero;
    private LocalDateTime createdAt;
}
