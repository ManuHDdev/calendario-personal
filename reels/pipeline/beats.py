"""Deteccion de beats de la pista musical.

Los cortes caen en el beat, no a intervalo fijo. Un corte a 2.0s exactos se
nota como mecanico; el mismo corte sobre el golpe de la bateria se lee como
intencionado aunque el espectador no sepa por que.
"""

from __future__ import annotations

from pathlib import Path


def detectar_beats(ruta_musica: Path) -> tuple[float, list[float]]:
    """Devuelve (bpm, lista de instantes de beat en segundos)."""
    import librosa

    y, sr = librosa.load(str(ruta_musica), mono=True)
    tempo, marcos = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    instantes = librosa.frames_to_time(marcos, sr=sr)

    bpm = float(tempo.item() if hasattr(tempo, "item") else tempo)
    return bpm, [float(t) for t in instantes]


def rejilla_regular(duracion_objetivo: float, paso: float) -> list[float]:
    """Rejilla a intervalo fijo, para cuando no hay beats fiables."""
    n = max(1, int(duracion_objetivo / paso))
    cortes = [i * paso for i in range(n + 1)]
    if cortes[-1] < duracion_objetivo:
        cortes.append(duracion_objetivo)
    return cortes


def rejilla_de_cortes(
    beats: list[float],
    duracion_objetivo: float,
    max_plano: float,
    min_plano: float = 0.6,
) -> list[float]:
    """Elige que beats son corte, respetando el techo de duracion de plano.

    Se avanza beat a beat acumulando; se corta en cuanto se supera `min_plano`,
    y se fuerza el corte si el siguiente beat se pasaria de `max_plano`. Ese
    "se fuerza" es lo que garantiza el techo pase lo que pase con el tempo:
    con una cancion lenta, dos beats pueden ser mas de 3 segundos.
    """
    # Una pista ambient o muy comprimida puede no dar onsets claros. Antes de
    # abortar el montaje se cae a una rejilla regular: peor sincronia, pero un
    # reel montado vale mas que una excepcion.
    if len(beats) < 4:
        return rejilla_regular(duracion_objetivo, max_plano)

    cortes = [beats[0]]
    for beat in beats[1:]:
        if beat > duracion_objetivo:
            break
        transcurrido = beat - cortes[-1]
        if transcurrido < min_plano:
            continue
        if transcurrido <= max_plano:
            cortes.append(beat)
            continue
        # El salto al siguiente beat se pasa del techo: se corta a mitad de
        # camino en vez de dejar un plano largo. Pierde sincronia, gana ritmo.
        actual = cortes[-1]
        while beat - actual > max_plano:
            actual += max_plano
            if actual > duracion_objetivo:
                break
            cortes.append(actual)
        if beat - cortes[-1] >= min_plano and beat <= duracion_objetivo:
            cortes.append(beat)

    if cortes[-1] < duracion_objetivo:
        cortes.append(duracion_objetivo)
    return cortes
