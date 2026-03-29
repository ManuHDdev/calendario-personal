package com.manuhddev.calendario.exception;

public class ImagenEventoNotFoundException extends RuntimeException {

    public ImagenEventoNotFoundException(Long id) {
        super("Imagen no encontrada con id: " + id);
    }

    public ImagenEventoNotFoundException(String message) {
        super(message);
    }
}
