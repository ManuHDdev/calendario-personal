"""Render con ffmpeg: 9:16, punch-in, concatenado, musica con ducking y subtitulos.

Se renderiza plano a plano a intermedios normalizados y luego se concatena, en
vez de montar un unico filter_complex gigante. Es algo mas lento, pero cuando
un plano falla se ve cual, y el fallo no se lleva por delante el reel entero.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from .plan import Plano

ANCHO = 1080
ALTO = 1920
FPS = 30

# Cuanto se acerca la camara a lo largo del plano. 8% es suficiente para que
# nada quede quieto y poco para que no se lea como un zoom.
PUNCH_IN = 0.08

# Margen de escalado antes del zoom, para que el recorte no pierda nitidez.
ESCALA_TRABAJO = 1.30


def _ejecutar(orden: list[str]) -> None:
    resultado = subprocess.run(orden, capture_output=True, text=True)
    if resultado.returncode != 0:
        cola = "\n".join(resultado.stderr.strip().splitlines()[-12:])
        raise RuntimeError(f"ffmpeg fallo:\n{' '.join(orden[:8])} ...\n{cola}")


def _filtro_plano(plano: Plano) -> str:
    """Recorte a 9:16 + punch-in progresivo."""
    fotogramas = max(2, int(round(plano.duracion * FPS)))
    ancho_trabajo = int(ANCHO * ESCALA_TRABAJO) // 2 * 2
    alto_trabajo = int(ALTO * ESCALA_TRABAJO) // 2 * 2

    if plano.clip.es_vertical:
        # Ya es vertical: encuadra a 9:16 por si acaso no es exacto.
        recorte = "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'"
    else:
        # Horizontal: se queda el centro. Sin seguimiento de sujeto en v1.
        recorte = "crop=ih*9/16:ih"

    zoom = (
        f"zoompan=z='1+{PUNCH_IN}*on/{fotogramas - 1}'"
        f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d=1:s={ANCHO}x{ALTO}:fps={FPS}"
    )

    return (
        f"{recorte},scale={ancho_trabajo}:{alto_trabajo},"
        f"{zoom},setsar=1,format=yuv420p"
    )


def render_plano(plano: Plano, destino: Path) -> Path:
    """Un plano normalizado: 1080x1920, 30fps, siempre con pista de audio.

    El audio de silencio en los planos sin sonido no es decorativo: el
    concatenado necesita que todos los intermedios tengan las mismas pistas,
    o descarta el audio a partir del primero que no la traiga.
    """
    orden = ["ffmpeg", "-v", "error", "-y"]
    orden += ["-ss", f"{plano.origen:.3f}", "-t", f"{plano.duracion:.3f}",
              "-i", str(plano.clip.ruta)]

    if plano.clip.tiene_audio:
        mapa_audio = ["-map", "0:a:0"]
    else:
        orden += ["-f", "lavfi", "-t", f"{plano.duracion:.3f}",
                  "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        mapa_audio = ["-map", "1:a:0"]

    orden += [
        "-vf", _filtro_plano(plano),
        "-map", "0:v:0", *mapa_audio,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-ar", "48000", "-ac", "2",
        "-t", f"{plano.duracion:.3f}",
        str(destino),
    ]
    _ejecutar(orden)
    return destino


def concatenar(intermedios: list[Path], destino: Path) -> Path:
    lista = destino.parent / "planos.txt"
    lista.write_text(
        "".join(f"file '{p.resolve()}'\n" for p in intermedios), encoding="utf-8"
    )
    _ejecutar([
        "ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0",
        "-i", str(lista), "-c", "copy", str(destino),
    ])
    return destino


def mezclar_y_subtitular(
    video: Path,
    musica: Path | None,
    subtitulos: Path | None,
    destino: Path,
    volumen_musica: float = 0.35,
) -> Path:
    """Musica por debajo, agachada bajo la voz, y subtitulos quemados."""
    orden = ["ffmpeg", "-v", "error", "-y", "-i", str(video)]

    filtros = []
    if musica is not None:
        orden += ["-stream_loop", "-1", "-i", str(musica)]
        # sidechaincompress agacha la musica cuando entra la voz. Sin esto la
        # musica y el habla compiten y no se entiende ninguna de las dos.
        filtros.append(
            f"[1:a]volume={volumen_musica},aformat=sample_fmts=fltp:"
            f"sample_rates=48000:channel_layouts=stereo[mus];"
            f"[0:a]aformat=sample_fmts=fltp:sample_rates=48000:"
            f"channel_layouts=stereo[voz];"
            f"[voz]asplit=2[voz1][voz2];"
            f"[mus][voz1]sidechaincompress=threshold=0.03:ratio=6:"
            f"attack=20:release=400[ducked];"
            f"[ducked][voz2]amix=inputs=2:duration=first:dropout_transition=0[a]"
        )
        mapa_audio = ["-map", "[a]"]
    else:
        mapa_audio = ["-map", "0:a?"]

    if subtitulos is not None:
        filtros.append(f"[0:v]ass={_escapar_ruta(subtitulos)}[v]")
        mapa_video = ["-map", "[v]"]
    else:
        mapa_video = ["-map", "0:v"]

    if filtros:
        orden += ["-filter_complex", ";".join(filtros)]

    orden += [
        *mapa_video, *mapa_audio,
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-shortest",
        str(destino),
    ]
    _ejecutar(orden)
    return destino


def _escapar_ruta(ruta: Path) -> str:
    """ffmpeg parsea los filtros antes que las rutas: hay que escapar : y '."""
    texto = str(ruta.resolve())
    return texto.replace("\\", "/").replace(":", "\\\\:").replace("'", "\\\\'")
