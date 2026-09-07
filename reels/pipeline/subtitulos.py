"""Generacion del fichero ASS de subtitulos estilo karaoke.

Decisiones que no son de estilo sino de retencion:

- Grupos de 2-3 palabras, nunca frases: el ojo lee el grupo entero de un
  vistazo y vuelve a la imagen.
- La palabra activa cambia de color y crece un poco. Ese micromovimiento
  constante es lo que impide que el subtitulo se lea como un bloque estatico.
- Se pintan al 60% de altura, no abajo: la interfaz de TikTok/Reels tapa el
  tercio inferior con el texto del autor y los botones.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ANCHO = 1080
ALTO = 1920

# ASS usa &HAABBGGRR (alfa + BGR invertido), no RGB.
BLANCO = "&H00FFFFFF"
AMARILLO = "&H0000E5FF"
NEGRO = "&H00000000"

# 60% de altura: por encima de la UI de la app, por debajo del centro visual.
Y_TEXTO = int(ALTO * 0.60)

CUERPO = 86
CUERPO_ACTIVA = 100


@dataclass
class Palabra:
    texto: str
    inicio: float
    fin: float


def _tiempo_ass(segundos: float) -> str:
    segundos = max(0.0, segundos)
    horas, resto = divmod(segundos, 3600)
    minutos, seg = divmod(resto, 60)
    return f"{int(horas)}:{int(minutos):02d}:{seg:05.2f}"


def _escapar(texto: str) -> str:
    return texto.replace("\\", "").replace("{", "(").replace("}", ")").strip()


def agrupar(palabras: list[Palabra], por_grupo: int = 3) -> list[list[Palabra]]:
    return [palabras[i : i + por_grupo] for i in range(0, len(palabras), por_grupo)]


def construir_ass(palabras: list[Palabra], por_grupo: int = 3) -> str:
    cabecera = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {ANCHO}
PlayResY: {ALTO}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Reel,DejaVu Sans,{CUERPO},{BLANCO},{BLANCO},{NEGRO},{NEGRO},-1,0,0,0,100,100,0,0,1,7,0,5,80,80,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    eventos = []
    for grupo in agrupar(palabras, por_grupo):
        for activa in grupo:
            partes = []
            for palabra in grupo:
                texto = _escapar(palabra.texto)
                if not texto:
                    continue
                if palabra is activa:
                    partes.append(f"{{\\c{AMARILLO}\\fs{CUERPO_ACTIVA}}}{texto}")
                else:
                    partes.append(f"{{\\c{BLANCO}\\fs{CUERPO}}}{texto}")
            if not partes:
                continue
            linea = f"{{\\pos({ANCHO // 2},{Y_TEXTO})}}" + " ".join(partes)
            eventos.append(
                f"Dialogue: 0,{_tiempo_ass(activa.inicio)},{_tiempo_ass(activa.fin)},"
                f"Reel,,0,0,0,,{linea}"
            )

    return cabecera + "\n".join(eventos) + "\n"


def escribir_ass(palabras: list[Palabra], destino: Path, por_grupo: int = 3) -> Path:
    destino.write_text(construir_ass(palabras, por_grupo), encoding="utf-8")
    return destino
