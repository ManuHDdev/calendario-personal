package com.manuhddev.calendario.service;

import com.manuhddev.calendario.dto.ImagenEventoResponseDTO;
import org.springframework.web.multipart.MultipartFile;

public interface ImagenEventoService {
    ImagenEventoResponseDTO addImagen(Long eventoId, MultipartFile file);
    void deleteImagen(Long eventoId, Long imagenId);
}
