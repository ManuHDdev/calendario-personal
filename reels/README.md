# Reels — edición automática de vídeos de viaje para TikTok/Reels/Shorts

Herramienta **local de escritorio**. No es una subapp del monorepo: no tiene
backend, ni imagen Docker en el VPS, ni entrada en el AppLauncher. El vídeo en
bruto pesa cientos de MB por minuto y el render quiere CPU que el VPS no tiene
libre.

## Qué hace

```
clips/ + canción  →  energía de movimiento por clip (el que más se mueve abre)
                  →  beats de la canción (librosa)
                  →  rejilla de cortes con techo duro de duración de plano
                  →  reparto de clips, sin repetir clip consecutivo
                  →  9:16 + punch-in progresivo en cada plano
                  →  faster-whisper: transcripción con marcas por palabra
                  →  subtítulos karaoke quemados + música con ducking
                  →  reel.mp4
```

Todo en tu máquina. Sin cuenta, sin clave de API, sin coste más allá de Claude Pro.

## Uso

```bash
pip install -r requirements.txt          # + ffmpeg en el PATH
python montar.py --clips ./clips --musica ./track.mp3 --salida reel.mp4
```

En Windows, edita las tres rutas de `montar.bat` y doble clic.

Opciones que importan:

| Opción | Por defecto | Para qué |
|---|---|---|
| `--duracion` | 30 | Duración objetivo del reel |
| `--max-plano` | 2.5 | Techo de duración de plano. Por encima de 3s se pierde atención |
| `--min-plano` | 0.6 | Suelo, para que no quede epiléptico |
| `--sin-subtitulos` | — | Salta la transcripción. Útil para iterar el montaje rápido |
| `--modelo-whisper` | small | `tiny`/`base`/`small`/`medium`/`large-v3` |

## Verificado (no "debería funcionar")

Probado de punta a punta sobre 5 clips sintéticos 1920x1080 y una pista de
percusión a 120 BPM. Medido sobre el fichero de salida, no a ojo:

| Comprobación | Resultado |
|---|---|
| Resolución de salida | **1080x1920**, 30 fps, AAC estéreo 48 kHz |
| Cortes detectados (scene change) | 19 en 19,03 s |
| Plano más largo | **1,03 s** (techo pedido: 2,5 s) |
| BPM detectado en pista de 120 BPM | 117,5, 78 beats |
| Punch-in sobre fuente 100% estática | Diferencia entre primer y último fotograma **3,56** (0 = no ocurre) |
| Subtítulos karaoke quemados | Palabra activa en amarillo y mayor, al 60% de altura |
| Todos los clips usados | Sí (5/5) |

Dos fallos encontrados y corregidos durante esa prueba:

1. **Un clip se quedaba siempre fuera.** La rotación elegía dentro de los
   candidatos de cada hueco y caía en un ciclo corto que se saltaba justo los
   del medio de la lista. Ahora recorre la lista entera.
2. **El montaje reventaba con música sin transitorios claros.** Una pista
   ambient devuelve cero beats y saltaba una excepción. Ahora cae a una rejilla
   regular: peor sincronía, pero un reel montado vale más que un error.

## Limitaciones conocidas de esta v1

Léelas antes de esperar magia:

- **No hay eliminación de silencios ni de muletillas.** Los tramos hablando a
  cámara se tratan como cualquier otro plano: se cortan al beat. Para tu caso
  ("mezcla de los dos") esta es la carencia que más se va a notar.
- **El recorte a 9:16 es al centro, sin seguimiento de cara.** Si te grabas
  descentrado, te sales del encuadre.
- **No hay texto de gancho superpuesto** en el primer segundo. Sí se elige como
  primer plano el de más movimiento, que es la mitad del truco.
- **La transcripción no se ha podido ejecutar en el entorno de desarrollo**
  (el proxy bloquea la descarga del modelo desde HuggingFace). El generador de
  subtítulos sí está verificado, alimentado con una transcripción de prueba.
  La primera ejecución en tu PC descargará el modelo (~500 MB para `small`).

## Por qué no usamos montage-ai

Era la opción elegida tras la primera investigación. **Queda descartada** al
leer su código:

- `src/montage_ai/transcriber.py` empieza con *"Audio transcription via Whisper
  on cgpu"*, y `Transcriber.is_available()` no es más que `is_cgpu_available()`.
- En su `requirements.txt` **no hay ningún Whisper local**: ni
  `openai-whisper`, ni `faster-whisper`, ni `torch`.
- [cgpu](https://github.com/RohanAdwankar/cgpu) es una CLI de 145 estrellas que
  rebusca GPU gratuita en la nube y exige un asistente de alta interactivo.
- No hay variable de entorno para pasarle un `.srt` propio: sólo `CAPTIONS` y
  `CAPTIONS_STYLE`.

Es decir: **los subtítulos, que es tu requisito no negociable, no se pueden
generar en local.** Dependen de un buscador de compute gratis de terceros.
Sumado a la licencia PolyForm Noncommercial (deja de amparar el uso el día que
la cuenta se monetice) y a las 47 estrellas, no es sitio donde construir.

Un detalle por si lo pruebas igualmente: **el estilo correcto es `viral`, no
`travel`**, pese al nombre. En `styles/travel.json`, `min_cut_beats=2` y
`max_cut_beats=8` dan planos de 1 a 4 s a 120 BPM — se pasa de tu techo — y
mete crossfades de 0,5 s. `viral.json` usa 0,5–2 beats y crossfade 0.
`probar-montage-ai.ps1` queda en la carpeta con esos ajustes ya puestos.

## Estado del open source (sept 2026)

Para el caso "vídeo largo hablando a cámara → shorts", que **no** es el nuestro:

| Proyecto | ⭐ | Licencia |
|---|---|---|
| [openshorts](https://github.com/mutonby/openshorts) | 3.9k | MIT (core) |
| [ClipsAI](https://github.com/ClipsAI/clipsai) | 538 | MIT |

Los ladrillos maduros sobre los que está construido esto:

| Pieza | Para qué | ⭐ / Licencia |
|---|---|---|
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Transcripción con marcas por palabra, en CPU | MIT |
| [WhisperX](https://github.com/m-bain/whisperX) | Alternativa con alineación wav2vec2, más precisa y más pesada | 23.9k / BSD-2 |
| [auto-editor](https://github.com/WyattBlue/auto-editor) | Quitar silencios (pendiente de integrar) | 5.2k / Unlicense |
| `librosa` | Beats | ISC |
| `ffmpeg` | Todo el vídeo | — |
