package com.manuhddev.calendario.service;

import com.manuhddev.calendario.dto.EventoRequestDTO;
import com.manuhddev.calendario.dto.EventoResumenDTO;
import com.manuhddev.calendario.dto.EventoResponseDTO;
import com.manuhddev.calendario.entity.Evento;
import com.manuhddev.calendario.entity.ImagenEvento;
import com.manuhddev.calendario.exception.EventoNotFoundException;
import com.manuhddev.calendario.mapper.EventoMapper;
import com.manuhddev.calendario.repository.EventoRepository;
import com.manuhddev.calendario.repository.ImagenEventoRepository;
import com.manuhddev.calendario.service.impl.EventoServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EventoServiceImplTest {

    @Mock private EventoRepository eventoRepository;
    @Mock private ImagenEventoRepository imagenEventoRepository;
    @Mock private EventoMapper eventoMapper;
    @InjectMocks private EventoServiceImpl eventoService;

    private Evento eventoActivo() {
        return Evento.builder()
                .id(1L).titulo("Test").fechaInicio(LocalDate.of(2025, 6, 1))
                .color("#0071e3").activo(true).build();
    }

    @Test
    void getEventosByAnio_OK() {
        Evento evento = eventoActivo();
        EventoResumenDTO dto = EventoResumenDTO.builder().id(1L).titulo("Test").build();
        when(eventoRepository.findByAnio(eq(2025), any(), any())).thenReturn(List.of(evento));
        when(eventoMapper.toResumenDTO(evento)).thenReturn(dto);

        List<EventoResumenDTO> result = eventoService.getEventosByAnio(2025);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getTitulo()).isEqualTo("Test");
    }

    @Test
    void getEventoById_OK() {
        Evento evento = eventoActivo();
        EventoResponseDTO dto = EventoResponseDTO.builder().id(1L).titulo("Test").build();
        when(eventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(evento));
        when(eventoMapper.toResponseDTO(evento)).thenReturn(dto);

        EventoResponseDTO result = eventoService.getEventoById(1L);

        assertThat(result.getId()).isEqualTo(1L);
    }

    @Test
    void getEventoById_noExiste() {
        when(eventoRepository.findByIdAndActivoTrue(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> eventoService.getEventoById(99L))
                .isInstanceOf(EventoNotFoundException.class);
    }

    @Test
    void createEvento_OK() {
        EventoRequestDTO request = EventoRequestDTO.builder()
                .titulo("Nuevo").fechaInicio(LocalDate.of(2025, 1, 1)).color("#0071e3").build();
        Evento evento = eventoActivo();
        EventoResponseDTO dto = EventoResponseDTO.builder().id(1L).titulo("Nuevo").build();
        when(eventoMapper.toEntity(request)).thenReturn(evento);
        when(eventoRepository.save(evento)).thenReturn(evento);
        when(eventoMapper.toResponseDTO(evento)).thenReturn(dto);

        EventoResponseDTO result = eventoService.createEvento(request);

        assertThat(result.getId()).isEqualTo(1L);
        verify(eventoRepository).save(evento);
    }

    @Test
    void createEvento_fechaFinAntesFechaInicio() {
        EventoRequestDTO request = EventoRequestDTO.builder()
                .titulo("Test").fechaInicio(LocalDate.of(2025, 6, 10))
                .fechaFin(LocalDate.of(2025, 6, 1)).color("#0071e3").build();

        assertThatThrownBy(() -> eventoService.createEvento(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("fechaFin");
    }

    @Test
    void updateEvento_OK() {
        EventoRequestDTO request = EventoRequestDTO.builder()
                .titulo("Actualizado").fechaInicio(LocalDate.of(2025, 1, 1)).color("#ff0000").build();
        Evento evento = eventoActivo();
        EventoResponseDTO dto = EventoResponseDTO.builder().id(1L).titulo("Actualizado").build();
        when(eventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(evento));
        when(eventoRepository.save(evento)).thenReturn(evento);
        when(eventoMapper.toResponseDTO(evento)).thenReturn(dto);

        eventoService.updateEvento(1L, request);

        verify(eventoMapper).updateEntityFromDTO(request, evento);
        verify(eventoRepository).save(evento);
    }

    @Test
    void deleteEvento_OK() {
        Evento evento = eventoActivo();
        ImagenEvento imagen = ImagenEvento.builder().id(1L).activo(true).build();
        when(eventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(evento));
        when(imagenEventoRepository.findAllByEventoIdAndActivoTrue(1L)).thenReturn(List.of(imagen));

        eventoService.deleteEvento(1L);

        assertThat(evento.isActivo()).isFalse();
        assertThat(evento.getDeletedAt()).isNotNull();
        assertThat(imagen.isActivo()).isFalse();
        assertThat(imagen.getDeletedAt()).isNotNull();
        verify(eventoRepository).save(evento);
    }

    @Test
    void deleteEvento_noExiste() {
        when(eventoRepository.findByIdAndActivoTrue(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> eventoService.deleteEvento(99L))
                .isInstanceOf(EventoNotFoundException.class);
    }
}
