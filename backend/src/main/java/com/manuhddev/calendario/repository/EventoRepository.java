package com.manuhddev.calendario.repository;

import com.manuhddev.calendario.entity.Evento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface EventoRepository extends JpaRepository<Evento, Long> {

    List<Evento> findAllByActivoTrue();

    Optional<Evento> findByIdAndActivoTrue(Long id);

    @Query("SELECT e FROM Evento e WHERE e.activo = true AND " +
           "(YEAR(e.fechaInicio) = :anio OR YEAR(e.fechaFin) = :anio OR " +
           "(e.fechaInicio <= :ultimoDia AND (e.fechaFin IS NULL OR e.fechaFin >= :primerDia)))")
    List<Evento> findByAnio(@Param("anio") int anio,
                            @Param("primerDia") LocalDate primerDia,
                            @Param("ultimoDia") LocalDate ultimoDia);
}
