#!/usr/bin/env python3
"""Prueba de humo: genera material sintetico, monta un reel y mide el resultado.

Sirve para dos cosas:

1. Verificar una instalacion nueva sin tener que sacar la tarjeta de la camara.
2. Detectar regresiones. Las cifras que comprueba son las que costaron encontrar
   los dos fallos de la primera version: un clip que nunca se usaba y una pista
   sin transitorios que hacia saltar una excepcion.

    python probar.py            # prueba completa (sin subtitulos, no baja modelo)
    python probar.py --conservar  # deja el material en ./prueba para poder verlo
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

DURACION = 15.0
MAX_PLANO = 2.5
BPM_PRUEBA = 120.0


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def generar_material(carpeta: Path) -> tuple[Path, Path]:
    """Cinco clips 16:9 con movimiento distinto y una pista con percusion real.

    El movimiento tiene que ser DISTINTO entre clips: es lo unico que permite
    comprobar que el reel abre con el plano mas vivo. Y la pista necesita
    transitorios de verdad (un seno con tremolo no vale): librosa no encuentra
    beats en una onda suave, y la prueba mediria la rejilla de emergencia en
    vez del camino normal.
    """
    clips = carpeta / "clips"
    musica = carpeta / "musica"
    clips.mkdir(parents=True, exist_ok=True)
    musica.mkdir(parents=True, exist_ok=True)

    fuentes = [
        ("1_estatico", "color=c=navy:size=1920x1080:rate=30:duration=8"),
        ("2_lento", "gradients=size=1920x1080:rate=30:duration=8"),
        ("3_medio", "testsrc2=size=1920x1080:rate=30:duration=8"),
        ("4_rapido", "mandelbrot=size=1920x1080:rate=30"),
        ("5_muy_rapido", "life=size=1920x1080:rate=30:mold=10"),
    ]
    for i, (nombre, fuente) in enumerate(fuentes):
        _ffmpeg(
            "-f", "lavfi", "-i", fuente, "-t", "8",
            "-f", "lavfi", "-i", f"sine=f={200 + i * 100}:d=8",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-shortest", str(clips / f"clip{nombre}.mp4"),
        )

    import numpy as np
    import soundfile as sf

    sr = 44100
    duracion = DURACION + 10
    paso = 60.0 / BPM_PRUEBA
    pista = np.zeros(int(sr * duracion), dtype=np.float32)
    rng = np.random.default_rng(0)

    t, golpe = 0.0, 0
    while t < duracion:
        n0 = int(t * sr)
        largo = int(0.18 * sr)
        tt = np.arange(largo) / sr
        bombo = np.sin(2 * np.pi * 60 * tt) * np.exp(-tt * 22)
        corto = int(0.04 * sr)
        th = np.arange(corto) / sr
        charles = rng.normal(0, 1, corto) * np.exp(-th * 90) * 0.35
        if n0 + largo < len(pista):
            pista[n0 : n0 + largo] += bombo * (1.0 if golpe % 4 == 0 else 0.6)
        if n0 + corto < len(pista):
            pista[n0 : n0 + corto] += charles
        t += paso
        golpe += 1

    pista /= np.max(np.abs(pista)) * 1.2
    ruta_musica = musica / "track.wav"
    sf.write(str(ruta_musica), pista, sr)
    return clips, ruta_musica


def medir(reel: Path) -> dict:
    def ffprobe(*args: str) -> str:
        return subprocess.run(
            ["ffprobe", "-v", "error", *args, str(reel)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()

    ancho, alto = ffprobe(
        "-select_streams", "v:0", "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
    ).split(",")
    duracion = float(ffprobe("-show_entries", "format=duration", "-of", "csv=p=0"))

    # Los cortes se miden con deteccion de cambio de escena sobre el resultado,
    # no leyendo la lista de decisiones: asi se comprueba lo que de verdad
    # acabo en el fichero, no lo que el plan decia que iba a acabar.
    salida = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(reel),
         "-vf", "select='gt(scene,0.3)',metadata=print:file=-", "-an", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stdout
    tiempos = [
        float(linea.split("pts_time:")[1].split()[0])
        for linea in salida.splitlines() if "pts_time:" in linea
    ]
    # Los primeros fotogramas dan falsos positivos; se ignoran los intervalos
    # ridiculamente cortos, que no son cortes sino ruido del detector.
    intervalos = [
        round(tiempos[i + 1] - tiempos[i], 2) for i in range(len(tiempos) - 1)
    ]
    intervalos = [d for d in intervalos if d > 0.2]

    return {
        "ancho": int(ancho),
        "alto": int(alto),
        "duracion": duracion,
        "cortes": len(intervalos),
        "plano_max": max(intervalos) if intervalos else 0.0,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--conservar", action="store_true",
                   help="Deja el material y el reel en ./prueba en vez de borrarlos")
    args = p.parse_args()

    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        print("error: ffmpeg/ffprobe no estan en el PATH", file=sys.stderr)
        return 1

    if args.conservar:
        carpeta = RAIZ / "prueba"
        carpeta.mkdir(exist_ok=True)
    else:
        carpeta = Path(tempfile.mkdtemp(prefix="prueba-reel-"))

    try:
        print("Generando material sintetico ...")
        clips, musica = generar_material(carpeta)

        reel = carpeta / "reel.mp4"
        print("Montando ...\n")
        resultado = subprocess.run(
            [sys.executable, str(RAIZ / "montar.py"),
             "--clips", str(clips), "--musica", str(musica), "--salida", str(reel),
             "--duracion", str(DURACION), "--max-plano", str(MAX_PLANO),
             "--sin-subtitulos"],
            cwd=str(RAIZ),
        )
        if resultado.returncode != 0:
            print("\nFALLO: el montaje termino con error", file=sys.stderr)
            return 1

        m = medir(reel)
        print("\n--- Medido sobre el fichero de salida ---")

        comprobaciones = [
            ("Resolucion 1080x1920",
             m["ancho"] == 1080 and m["alto"] == 1920,
             f"{m['ancho']}x{m['alto']}"),
            (f"Duracion proxima a {DURACION:.0f}s",
             abs(m["duracion"] - DURACION) <= 2.0,
             f"{m['duracion']:.2f}s"),
            ("Al menos 6 cortes",
             m["cortes"] >= 6,
             f"{m['cortes']} cortes"),
            (f"Ningun plano supera {MAX_PLANO}s",
             0 < m["plano_max"] <= MAX_PLANO + 0.15,
             f"el mas largo dura {m['plano_max']}s"),
        ]

        fallos = 0
        for etiqueta, ok, detalle in comprobaciones:
            print(f"  [{'OK ' if ok else 'MAL'}] {etiqueta}: {detalle}")
            fallos += 0 if ok else 1

        if args.conservar:
            print(f"\nMaterial conservado en {carpeta}")

        if fallos:
            print(f"\n{fallos} comprobacion(es) fallan.")
            return 1
        print("\nTodo correcto. La instalacion funciona.")
        return 0

    finally:
        if not args.conservar:
            shutil.rmtree(carpeta, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
