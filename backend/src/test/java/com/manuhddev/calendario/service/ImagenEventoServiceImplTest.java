package com.manuhddev.calendario.service;

import com.manuhddev.calendario.dto.ImagenEventoResponseDTO;
import com.manuhddev.calendario.entity.Evento;
import com.manuhddev.calendario.entity.ImagenEvento;
import com.manuhddev.calendario.exception.EventoNotFoundException;
import com.manuhddev.calendario.exception.ImagenEventoNotFoundException;
import com.manuhddev.calendario.mapper.ImagenEventoMapper;
import com.manuhddev.calendario.repository.EventoRepository;
import com.manuhddev.calendario.repository.ImagenEventoRepository;
import com.manuhddev.calendario.service.impl.ImagenEventoServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ImagenEventoServiceImplTest {

    @Mock private EventoRepository eventoRepository;
    @Mock private ImagenEventoRepository imagenEventoRepository;
    @Mock private ImagenEventoMapper imagenEventoMapper;
    @InjectMocks private ImagenEventoServiceImpl service;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "uploadsDir", tempDir.toString());
        ReflectionTestUtils.setField(service, "baseUrl", "http://localhost:8081/uploads");
    }

    private Evento eventoActivo() {
        return Evento.builder().id(1L).titulo("Test")
                .fechaInicio(LocalDate.of(2025, 1, 1))
                .color("#0071e3").activo(true).build();
    }

    private MockMultipartFile jpegFile() {
        return new MockMultipartFile("file", "photo.jpg", "image/jpeg", new byte[]{1, 2, 3});
    }

    @Test
    void addImagen_OK() {
        Evento evento = eventoActivo();
        ImagenEvento savedImagen = ImagenEvento.builder().id(1L).url("http://localhost:8081/uploads/test.jpg")
                .nombreFichero("test.jpg").activo(true).build();
        ImagenEventoResponseDTO dto = ImagenEventoResponseDTO.builder().id(1L).url("http://localhost:8081/uploads/test.jpg").build();

        when(eventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(evento));
        when(imagenEventoRepository.countByEventoIdAndActivoTrue(1L)).thenReturn(0L);
        when(imagenEventoRepository.save(any())).thenReturn(savedImagen);
        when(imagenEventoMapper.toResponseDTO(savedImagen)).thenReturn(dto);

        ImagenEventoResponseDTO result = service.addImagen(1L, jpegFile());

        assertThat(result.getUrl()).contains("uploads");
        verify(imagenEventoRepository).save(any(ImagenEvento.class));
    }

    @Test
    void addImagen_eventoNoExiste() {
        when(eventoRepository.findByIdAndActivoTrue(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.addImagen(99L, jpegFile()))
                .isInstanceOf(EventoNotFoundException.class);
    }

    @Test
    void addImagen_tipoInvalido() {
        when(eventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(eventoActivo()));
        MockMultipartFile txt = new MockMultipartFile("file", "doc.txt", "text/plain", new byte[]{1});

        assertThatThrownBy(() -> service.addImagen(1L, txt))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Tipo de fichero");
    }

    @Test
    void addImagen_tamanoExcedido() {
        when(eventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(eventoActivo()));
        byte[] bigFile = new byte[11 * 1024 * 1024]; // 11 MB > límite de 10 MB
        MockMultipartFile file = new MockMultipartFile("file", "big.jpg", "image/jpeg", bigFile);

        assertThatThrownBy(() -> service.addImagen(1L, file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("10MB");
    }

    @Test
    void addImagen_maximoAlcanzado() {
        when(eventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(eventoActivo()));
        when(imagenEventoRepository.countByEventoIdAndActivoTrue(1L)).thenReturn(10L);

        assertThatThrownBy(() -> service.addImagen(1L, jpegFile()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("10 imágenes");
    }

    @Test
    void deleteImagen_OK() {
        Evento evento = eventoActivo();
        ImagenEvento imagen = ImagenEvento.builder().id(1L).evento(evento).activo(true).build();
        when(imagenEventoRepository.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(imagen));

        service.deleteImagen(1L, 1L);

        assertThat(imagen.isActivo()).isFalse();
        assertThat(imagen.getDeletedAt()).isNotNull();
        verify(imagenEventoRepository).save(imagen);
    }

    @Test
    void deleteImagen_noExiste() {
        when(imagenEventoRepository.findByIdAndActivoTrue(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deleteImagen(1L, 99L))
                .isInstanceOf(ImagenEventoNotFoundException.class);
    }
}
