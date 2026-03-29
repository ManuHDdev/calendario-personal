package com.manuhddev.calendario.service.impl;

import com.manuhddev.calendario.dto.EventoRequestDTO;
import com.manuhddev.calendario.dto.EventoResponseDTO;
import com.manuhddev.calendario.dto.EventoResumenDTO;
import com.manuhddev.calendario.entity.Evento;
import com.manuhddev.calendario.entity.ImagenEvento;
import com.manuhddev.calendario.exception.EventoNotFoundException;
import com.manuhddev.calendario.mapper.EventoMapper;
import com.manuhddev.calendario.repository.EventoRepository;
import com.manuhddev.calendario.repository.ImagenEventoRepository;
import com.manuhddev.calendario.service.EventoService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class EventoServiceImpl implements EventoService {

    private final EventoRepository eventoRepository;
    private final ImagenEventoRepository imagenEventoRepository;
    private final EventoMapper eventoMapper;

    @Override
    public List<EventoResumenDTO> getEventosByAnio(int anio) {
        LocalDate primerDia = LocalDate.of(anio, 1, 1);
        LocalDate ultimoDia = LocalDate.of(anio, 12, 31);
        return eventoRepository.findByAnio(anio, primerDia, ultimoDia)
                .stream()
                .map(eventoMapper::toResumenDTO)
                .toList();
    }

    @Override
    public EventoResponseDTO getEventoById(Long id) {
        Evento evento = eventoRepository.findByIdAndActivoTrue(id)
                .orElseThrow(() -> new EventoNotFoundException(id));
        return eventoMapper.toResponseDTO(evento);
    }

    @Override
    @Transactional
    public EventoResponseDTO createEvento(EventoRequestDTO dto) {
        validarFechas(dto);
        Evento evento = eventoMapper.toEntity(dto);
        return eventoMapper.toResponseDTO(eventoRepository.save(evento));
    }

    @Override
    @Transactional
    public EventoResponseDTO updateEvento(Long id, EventoRequestDTO dto) {
        Evento evento = eventoRepository.findByIdAndActivoTrue(id)
                .orElseThrow(() -> new EventoNotFoundException(id));
        validarFechas(dto);
        eventoMapper.updateEntityFromDTO(dto, evento);
        return eventoMapper.toResponseDTO(eventoRepository.save(evento));
    }

    @Override
    @Transactional
    public void deleteEvento(Long id) {
        Evento evento = eventoRepository.findByIdAndActivoTrue(id)
                .orElseThrow(() -> new EventoNotFoundException(id));

        List<ImagenEvento> imagenes = imagenEventoRepository.findAllByEventoIdAndActivoTrue(id);
        LocalDateTime now = LocalDateTime.now();
        imagenes.forEach(img -> {
            img.setActivo(false);
            img.setDeletedAt(now);
        });
        imagenEventoRepository.saveAll(imagenes);

        evento.setActivo(false);
        evento.setDeletedAt(now);
        eventoRepository.save(evento);
    }

    private void validarFechas(EventoRequestDTO dto) {
        if (dto.getFechaFin() != null && dto.getFechaFin().isBefore(dto.getFechaInicio())) {
            throw new IllegalArgumentException("fechaFin no puede ser anterior a fechaInicio");
        }
    }
}
