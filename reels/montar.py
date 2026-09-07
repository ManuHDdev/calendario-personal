#!/usr/bin/env python3
"""Monta un reel vertical a partir de una carpeta de clips y una cancion.

    python montar.py --clips ./clips --musica ./track.mp3 --salida reel.mp4

Todo corre en local: ffmpeg para el video, librosa para los beats y
faster-whisper para los subtitulos. Sin cuenta, sin clave de API, sin coste.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

from pipeline import beats as mod_beats
from pipeline import render as mod_render
from pipeline import subtitulos as mod_subs
from pipeline.analisis import analizar_carpeta
from pipeline.plan import construir_plan


def parsear_argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Montaje automatico de reels verticales (TikTok/Reels/Shorts).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--clips", type=Path, required=True, help="Carpeta con los clips")
    p.add_argument("--musica", type=Path, help="Pista musical que marca el ritmo")
    p.add_argument("--salida", type=Path, default=Path("reel.mp4"))
    p.add_argument("--duracion", type=float, default=30.0,
                   help="Duracion objetivo del reel en segundos")
    p.add_argument("--max-plano", type=float, default=2.5,
                   help="Techo de duracion de plano. Por encima de 3s se pierde atencion")
    p.add_argument("--min-plano", type=float, default=0.6,
                   help="Suelo de duracion de plano, para que no sea epileptico")
    p.add_argument("--sin-subtitulos", action="store_true",
                   help="Salta la transcripcion (util para iterar el montaje)")
    p.add_argument("--modelo-whisper", default="small",
                   help="tiny/base/small/medium/large-v3")
    p.add_argument("--idioma", default="es")
    p.add_argument("--trabajo", type=Path,
                   help="Carpeta de intermedios. Por defecto, una temporal que se borra")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parsear_argumentos(argv)

    if not args.clips.is_dir():
        print(f"error: no existe la carpeta {args.clips}", file=sys.stderr)
        return 1
    if args.musica is not None and not args.musica.is_file():
        print(f"error: no existe la pista {args.musica}", file=sys.stderr)
        return 1
    if args.max_plano <= args.min_plano:
        print("error: --max-plano tiene que ser mayor que --min-plano", file=sys.stderr)
        return 1

    temporal = args.trabajo is None
    trabajo = Path(tempfile.mkdtemp(prefix="reel-")) if temporal else args.trabajo
    trabajo.mkdir(parents=True, exist_ok=True)

    try:
        print(f"[1/6] Analizando clips en {args.clips} ...")
        clips = analizar_carpeta(args.clips)
        for c in sorted(clips, key=lambda c: c.movimiento, reverse=True):
            print(f"      {c.ruta.name:28s} {c.duracion:6.1f}s  "
                  f"{c.ancho}x{c.alto}  movimiento={c.movimiento:.4f}")

        if args.musica is not None:
            print("[2/6] Detectando beats ...")
            bpm, instantes = mod_beats.detectar_beats(args.musica)
            if len(instantes) < 4:
                print(f"      aviso: solo {len(instantes)} beats detectables en la "
                      f"pista; se monta con rejilla regular")
            else:
                print(f"      {bpm:.1f} BPM, {len(instantes)} beats")
        else:
            # Sin musica no hay ritmo que seguir: rejilla regular al techo.
            print("[2/6] Sin musica: rejilla regular")
            bpm = 0.0
            paso = args.max_plano
            instantes = [i * paso for i in range(int(args.duracion / paso) + 2)]

        cortes = mod_beats.rejilla_de_cortes(
            instantes, args.duracion, args.max_plano, args.min_plano
        )
        duraciones = [cortes[i + 1] - cortes[i] for i in range(len(cortes) - 1)]
        print(f"      {len(duraciones)} planos, "
              f"del mas corto {min(duraciones):.2f}s al mas largo {max(duraciones):.2f}s")

        print("[3/6] Repartiendo clips ...")
        planos = construir_plan(clips, cortes)
        print(f"      abre {planos[0].clip.ruta.name} (el de mas movimiento)")

        print(f"[4/6] Renderizando {len(planos)} planos ...")
        intermedios = []
        for i, plano in enumerate(planos):
            destino = trabajo / f"plano_{i:03d}.mp4"
            mod_render.render_plano(plano, destino)
            intermedios.append(destino)
            print(f"      {i + 1}/{len(planos)}  {plano.clip.ruta.name} "
                  f"@{plano.origen:.1f}s  {plano.duracion:.2f}s")

        concatenado = trabajo / "concatenado.mp4"
        mod_render.concatenar(intermedios, concatenado)

        ruta_ass = None
        if args.sin_subtitulos:
            print("[5/6] Subtitulos: saltados (--sin-subtitulos)")
        else:
            print(f"[5/6] Transcribiendo con whisper '{args.modelo_whisper}' ...")
            from pipeline.transcripcion import transcribir

            palabras = transcribir(concatenado, args.modelo_whisper, args.idioma)
            if palabras:
                ruta_ass = mod_subs.escribir_ass(palabras, trabajo / "subs.ass")
                print(f"      {len(palabras)} palabras")
            else:
                print("      sin voz detectada, se monta sin subtitulos")

        print("[6/6] Mezclando y quemando ...")
        args.salida.parent.mkdir(parents=True, exist_ok=True)
        mod_render.mezclar_y_subtitular(
            concatenado, args.musica, ruta_ass, args.salida
        )
        print(f"\nListo: {args.salida.resolve()}")
        return 0

    finally:
        if temporal:
            shutil.rmtree(trabajo, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
