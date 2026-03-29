package com.manuhddev.calendario.mapper;

import com.manuhddev.calendario.dto.ImagenEventoResponseDTO;
import com.manuhddev.calendario.entity.ImagenEvento;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface ImagenEventoMapper {
    ImagenEventoResponseDTO toResponseDTO(ImagenEvento imagenEvento);
}
