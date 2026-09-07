"""Reparto de los clips sobre la rejilla de cortes (la lista de decisiones).

Dos reglas mandan sobre el resto:

1. El primer plano es el de mas movimiento. El primer segundo decide si el
   espectador se queda; gastarlo en el plano mas quieto es tirarlo.
2. Nunca dos planos seguidos del mismo clip. Aunque sean segundos distintos,
   el ojo lo lee como "no ha pasado nada" y el corte deja de funcionar.
"""

from __future__ import annotations

from dataclasses import dataclass

from .analisis import Clip


@dataclass
class Plano:
    clip: Clip
    origen: float   # segundo del clip donde empieza
    inicio: float   # segundo del reel donde entra
    duracion: float


def construir_plan(clips: list[Clip], cortes: list[float]) -> list[Plano]:
    if len(cortes) < 2:
        raise ValueError("Hacen falta al menos dos cortes para montar un plano")

    # El de mas movimiento abre; el resto detras, tambien de mas a menos.
    ordenados = sorted(clips, key=lambda c: c.movimiento, reverse=True)

    # Cursor por clip: cada vez que se usa un clip se avanza, para no repetir
    # los mismos segundos. Al agotarlo se vuelve al principio.
    cursor: dict[str, float] = {str(c.ruta): 0.0 for c in clips}

    planos: list[Plano] = []
    anterior: Clip | None = None

    for i in range(len(cortes) - 1):
        inicio, fin = cortes[i], cortes[i + 1]
        duracion = fin - inicio

        # Vuelta ciclica sobre todos los clips, empezando por el de mas
        # movimiento. Recorrer la lista entera (en vez de elegir dentro de los
        # candidatos de cada hueco) es lo que garantiza que ningun clip se
        # queda fuera: una eleccion por hueco cae en un ciclo corto y se salta
        # justo los del medio de la lista.
        clip = ordenados[i % len(ordenados)]
        if clip is anterior and len(ordenados) > 1:
            clip = ordenados[(i + 1) % len(ordenados)]

        clave = str(clip.ruta)
        origen = cursor[clave]
        if origen + duracion > clip.duracion:
            origen = 0.0
        cursor[clave] = origen + duracion

        planos.append(Plano(clip=clip, origen=origen, inicio=inicio, duracion=duracion))
        anterior = clip

    return planos
