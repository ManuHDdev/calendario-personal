package com.manuhddev.calendario.exception;

public class EventoNotFoundException extends RuntimeException {

    public EventoNotFoundException(Long id) {
        super("Evento no encontrado con id: " + id);
    }

    public EventoNotFoundException(String message) {
        super(message);
    }
}
