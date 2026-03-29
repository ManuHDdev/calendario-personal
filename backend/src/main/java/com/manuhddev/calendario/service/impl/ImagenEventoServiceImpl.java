package com.manuhddev.calendario.service.impl;

import com.manuhddev.calendario.dto.ImagenEventoResponseDTO;
import com.manuhddev.calendario.entity.ImagenEvento;
import com.manuhddev.calendario.exception.EventoNotFoundException;
import com.manuhddev.calendario.exception.ImagenEventoNotFoundException;
import com.manuhddev.calendario.mapper.ImagenEventoMapper;
import com.manuhddev.calendario.repository.EventoRepository;
import com.manuhddev.calendario.repository.ImagenEventoRepository;
import com.manuhddev.calendario.service.ImagenEventoService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ImagenEventoServiceImpl implements ImagenEventoService {

    private static final Set<String> TIPOS_PERMITIDOS = Set.of(
            "image/jpeg", "image/png", "image/webp", "application/pdf"
    );
    private static final long MAX_BYTES = 10L * 1024 * 1024; // 10 MB para PDF
    private static final int MAX_IMAGENES = 10;

    private final EventoRepository eventoRepository;
    private final ImagenEventoRepository imagenEventoRepository;
    private final ImagenEventoMapper imagenEventoMapper;

    @Value("${app.uploads.dir}")
    private String uploadsDir;

    @Value("${app.uploads.base-url}")
    private String baseUrl;

    @Override
    @Transactional
    public ImagenEventoResponseDTO addImagen(Long eventoId, MultipartFile file) {
        var evento = eventoRepository.findByIdAndActivoTrue(eventoId)
                .orElseThrow(() -> new EventoNotFoundException(eventoId));

        String contentType = file.getContentType();
        if (contentType == null || !TIPOS_PERMITIDOS.contains(contentType)) {
            throw new IllegalArgumentException("Tipo de fichero no permitido. Se aceptan JPEG, PNG, WebP y PDF.");
        }

        if (file.getSize() > MAX_BYTES) {
            throw new IllegalArgumentException("El fichero supera el tamaño máximo de 10MB");
        }

        if (imagenEventoRepository.countByEventoIdAndActivoTrue(eventoId) >= MAX_IMAGENES) {
            throw new IllegalStateException("No se pueden añadir más de 10 imágenes por evento");
        }

        String originalFilename = file.getOriginalFilename();
        String extension = originalFilename != null && originalFilename.contains(".")
                ? originalFilename.substring(originalFilename.lastIndexOf('.'))
                : ".jpg";
        String nombreFichero = UUID.randomUUID() + extension;

        try {
            var uploadsPath = Paths.get(uploadsDir);
            Files.createDirectories(uploadsPath);
            Files.copy(file.getInputStream(), uploadsPath.resolve(nombreFichero));
        } catch (IOException e) {
            throw new RuntimeException("Error al guardar el fichero: " + e.getMessage(), e);
        }

        String tipo = "application/pdf".equals(contentType) ? "pdf" : "imagen";

        ImagenEvento imagen = ImagenEvento.builder()
                .evento(evento)
                .url(baseUrl + "/" + nombreFichero)
                .nombreFichero(nombreFichero)
                .tipo(tipo)
                .activo(true)
                .build();

        return imagenEventoMapper.toResponseDTO(imagenEventoRepository.save(imagen));
    }

    @Override
    @Transactional
    public void deleteImagen(Long eventoId, Long imagenId) {
        ImagenEvento imagen = imagenEventoRepository.findByIdAndActivoTrue(imagenId)
                .orElseThrow(() -> new ImagenEventoNotFoundException(imagenId));

        if (!imagen.getEvento().getId().equals(eventoId)) {
            throw new IllegalArgumentException("La imagen no pertenece al evento indicado");
        }

        imagen.setActivo(false);
        imagen.setDeletedAt(LocalDateTime.now());
        imagenEventoRepository.save(imagen);
    }
}
