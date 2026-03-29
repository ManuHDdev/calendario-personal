package com.manuhddev.calendario.service;

import com.manuhddev.calendario.dto.EventoRequestDTO;
import com.manuhddev.calendario.dto.EventoResponseDTO;
import com.manuhddev.calendario.dto.EventoResumenDTO;

import java.util.List;

public interface EventoService {
    List<EventoResumenDTO> getEventosByAnio(int anio);
    EventoResponseDTO getEventoById(Long id);
    EventoResponseDTO createEvento(EventoRequestDTO dto);
    EventoResponseDTO updateEvento(Long id, EventoRequestDTO dto);
    void deleteEvento(Long id);
}
