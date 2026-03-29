package com.manuhddev.calendario.repository;

import com.manuhddev.calendario.entity.ImagenEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ImagenEventoRepository extends JpaRepository<ImagenEvento, Long> {

    List<ImagenEvento> findAllByEventoIdAndActivoTrue(Long eventoId);

    Optional<ImagenEvento> findByIdAndActivoTrue(Long id);

    long countByEventoIdAndActivoTrue(Long eventoId);
}
