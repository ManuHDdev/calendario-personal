"""Lectura de los clips de entrada: metadatos y energia de movimiento.

La energia de movimiento es lo que permite decidir el orden sin ver el video:
un plano quieto es un plano aburrido, y el primero del reel tiene que ser el
que mas se mueve.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

EXTENSIONES = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}


@dataclass
class Clip:
    ruta: Path
    duracion: float
    ancho: int
    alto: int
    fps: float
    tiene_audio: bool
    movimiento: float = 0.0

    @property
    def es_vertical(self) -> bool:
        return self.alto > self.ancho


def _ffprobe(ruta: Path) -> dict:
    salida = subprocess.run(
        [
            "ffprobe", "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", str(ruta),
        ],
        capture_output=True, text=True, check=True,
    )
    return json.loads(salida.stdout)


def _fps(cadena: str) -> float:
    """'30000/1001' -> 29.97. ffprobe siempre devuelve una fraccion."""
    if "/" in cadena:
        num, den = cadena.split("/", 1)
        return float(num) / float(den) if float(den) else 0.0
    return float(cadena)


def medir_movimiento(ruta: Path, muestras_por_segundo: int = 2) -> float:
    """Diferencia media entre fotogramas consecutivos, de 0 a 1.

    Se decodifica a 160x90 en gris: sobra para comparar planos entre si y
    cuesta una fraccion de lo que costaria a resolucion completa.
    """
    proceso = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(ruta),
            "-vf", f"fps={muestras_por_segundo},scale=160:90,format=gray",
            "-f", "rawvideo", "-pix_fmt", "gray", "-",
        ],
        capture_output=True, check=True,
    )
    datos = proceso.stdout
    tam = 160 * 90
    n = len(datos) // tam
    if n < 2:
        return 0.0

    import numpy as np

    fotogramas = np.frombuffer(datos[: n * tam], dtype=np.uint8).reshape(n, tam)
    diferencias = np.abs(np.diff(fotogramas.astype(np.int16), axis=0)).mean()
    return float(diferencias / 255.0)


def analizar_clip(ruta: Path, con_movimiento: bool = True) -> Clip:
    datos = _ffprobe(ruta)
    video = next((s for s in datos["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        raise ValueError(f"{ruta.name} no tiene pista de video")

    clip = Clip(
        ruta=ruta,
        duracion=float(datos["format"]["duration"]),
        ancho=int(video["width"]),
        alto=int(video["height"]),
        fps=_fps(video.get("avg_frame_rate", "0/1")),
        tiene_audio=any(s["codec_type"] == "audio" for s in datos["streams"]),
    )
    if con_movimiento:
        clip.movimiento = medir_movimiento(ruta)
    return clip


def analizar_carpeta(carpeta: Path, con_movimiento: bool = True) -> list[Clip]:
    rutas = sorted(p for p in carpeta.iterdir() if p.suffix.lower() in EXTENSIONES)
    if not rutas:
        raise FileNotFoundError(f"No hay clips de video en {carpeta}")
    return [analizar_clip(p, con_movimiento) for p in rutas]
