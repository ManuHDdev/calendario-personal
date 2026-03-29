package com.manuhddev.calendario.mapper;

import com.manuhddev.calendario.dto.EventoRequestDTO;
import com.manuhddev.calendario.dto.EventoResponseDTO;
import com.manuhddev.calendario.dto.EventoResumenDTO;
import com.manuhddev.calendario.entity.Evento;
import org.mapstruct.*;

@Mapper(componentModel = "spring", uses = {ImagenEventoMapper.class})
public interface EventoMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "activo", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "imagenes", ignore = true)
    Evento toEntity(EventoRequestDTO dto);

    EventoResponseDTO toResponseDTO(Evento evento);

    EventoResumenDTO toResumenDTO(Evento evento);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "activo", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "imagenes", ignore = true)
    void updateEntityFromDTO(EventoRequestDTO dto, @MappingTarget Evento evento);
}
