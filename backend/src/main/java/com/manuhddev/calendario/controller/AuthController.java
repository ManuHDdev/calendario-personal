package com.manuhddev.calendario.controller;

import com.manuhddev.calendario.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Gestión de sesión")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Cerrar sesión",
               description = "Invalida el token JWT en Keycloak y cierra la sesión del usuario")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Sesión cerrada correctamente"),
            @ApiResponse(responseCode = "401", description = "Token ausente o inválido"),
            @ApiResponse(responseCode = "500", description = "Error al comunicarse con Keycloak")
    })
    public void logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        authService.logout(authHeader);
    }
}
