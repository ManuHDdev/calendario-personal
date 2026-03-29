package com.manuhddev.calendario.service;

import com.manuhddev.calendario.dto.EventoRequestDTO;
import com.manuhddev.calendario.dto.EventoResponseDTO;
import com.manuhddev.calendario.dto.EventoResumenDTO;

import java.util.List;

public interface EventoService {
    List<EventoResumenDTO> getEventosByAnio(int anio);
    List<EventoResumenDTO> getEventosByMes(int anio, int mes);
    List<EventoResumenDTO> buscarEventos(int anio, Integer mes, String q, String color);
    EventoResponseDTO getEventoById(Long id);
    EventoResponseDTO createEvento(EventoRequestDTO dto);
    EventoResponseDTO updateEvento(Long id, EventoRequestDTO dto);
    void deleteEvento(Long id);
}
