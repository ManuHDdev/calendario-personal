"""Transcripcion local con faster-whisper, con marcas por palabra.

Se transcribe el montaje YA concatenado, no los clips sueltos. Es la decision
que hace que los subtitulos cuadren siempre: las marcas salen ya en la linea
de tiempo final, sin tener que reproyectar los tiempos de cada recorte. El
precio es que la transcripcion no puede guiar el montaje; para la v1 compensa.

Todo corre en la maquina local. Sin cuenta, sin clave de API, sin coste.
"""

from __future__ import annotations

from pathlib import Path

from .subtitulos import Palabra

# 'small' es el equilibrio razonable en CPU para espanol. 'medium' transcribe
# mejor los nombres propios pero tarda del orden de tres veces mas.
MODELO_POR_DEFECTO = "small"


def transcribir(
    ruta_media: Path,
    modelo: str = MODELO_POR_DEFECTO,
    idioma: str | None = "es",
) -> list[Palabra]:
    from faster_whisper import WhisperModel

    # int8 en CPU: la unica combinacion que va a velocidad util sin GPU.
    whisper = WhisperModel(modelo, device="cpu", compute_type="int8")

    segmentos, _info = whisper.transcribe(
        str(ruta_media),
        language=idioma,
        word_timestamps=True,
        vad_filter=True,  # descarta los tramos sin voz, que es la mitad de un reel
    )

    palabras: list[Palabra] = []
    for segmento in segmentos:
        for palabra in segmento.words or []:
            texto = palabra.word.strip()
            if texto:
                palabras.append(
                    Palabra(texto=texto, inicio=palabra.start, fin=palabra.end)
                )
    return palabras
