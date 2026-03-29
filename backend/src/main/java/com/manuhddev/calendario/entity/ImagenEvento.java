package com.manuhddev.calendario.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "imagenes_evento")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImagenEvento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "evento_id", nullable = false)
    private Evento evento;

    @Column(nullable = false)
    private String url;

    @Column(nullable = false)
    private String nombreFichero;

    /** "imagen" o "pdf" */
    @Column(nullable = false)
    @Builder.Default
    private String tipo = "imagen";

    @Column(nullable = false)
    @Builder.Default
    private boolean activo = true;

    private LocalDateTime deletedAt;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
