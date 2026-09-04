# Reels — edición automática de vídeos de viaje para TikTok/Reels/Shorts

Carpeta de trabajo (no es una subapp del monorepo: no tiene backend, ni Docker
en el VPS, ni entrada en el AppLauncher). Es una herramienta **local, de
escritorio**, porque el vídeo en bruto pesa cientos de MB por minuto y el
renderizado quiere CPU/GPU que el VPS no tiene libre.

## Qué queremos

Vídeo 9:16 a partir de material de viaje (mezcla de plano a cámara + recurso),
con:

- Subtítulos quemados, palabra a palabra (estilo karaoke)
- Un corte cada **< 3 s**
- Silencios y muletillas fuera
- Trucos de retención: gancho en el primer segundo, punch-in de zoom en planos
  largos, cortes al ritmo de la música, cierre en bucle

## Estado de la investigación (sept 2026)

**Conclusión corta: no existe un proyecto que haga exactamente esto de una
pieza.** Lo que hay se divide en dos familias, y ninguna es nuestro caso
exacto:

### Familia A — "vídeo largo → shorts" (podcast / hablando a cámara)

Cogen una grabación de una hora, buscan el momento bueno con un LLM, recortan a
9:16 siguiendo la cara y queman subtítulos. Maduros y bien mantenidos, pero
suponen **una sola toma continua con alguien hablando**, no 40 clips sueltos de
un viaje.

| Proyecto | ⭐ | Licencia | Nota |
|---|---|---|---|
| [openshorts](https://github.com/mutonby/openshorts) | 3.9k | MIT (core) | Lo más completo: detección de momentos, reencuadre con seguimiento de cara, subtítulos, doblaje. Self-host gratis de verdad. Necesita LLM (Gemini con free tier, u Ollama local). |
| [ClipsAI](https://github.com/ClipsAI/clipsai) | 538 | MIT | Librería Python. Reencuadre 16:9→9:16 siguiendo al que habla + recorte por transcripción. Pensado explícitamente para "podcasts, entrevistas, sermones". |

### Familia B — "muchos clips + música → montaje"

Esto sí es el montaje de viaje. Mucho más verde.

| Proyecto | ⭐ | Licencia | Nota |
|---|---|---|---|
| [montage-ai](https://github.com/mfahsold/montage-ai) | 47 | **PolyForm Noncommercial** | El único que cubre casi todo el pliego a la vez: detección de beats, análisis de escena, montaje, reencuadre a 9:16, quemado de subtítulos (plantillas TikTok/Karaoke), 8 estilos de corte. Local-first, sin LLM obligatorio. |

### Los ladrillos maduros (plan B: construir a medida)

Si montage-ai no da la talla, el pipeline se monta con estas piezas, todas
estables y de sobra probadas:

| Pieza | Para qué | ⭐ / Licencia |
|---|---|---|
| [WhisperX](https://github.com/m-bain/whisperX) | Transcripción con **timestamps por palabra** (subtítulo karaoke). Va en CPU con `--compute_type int8 --device cpu`. | 23.9k / BSD-2 |
| [auto-editor](https://github.com/WyattBlue/auto-editor) | Quitar silencios y tramos sin movimiento. Exporta también timeline a Premiere/Resolve/Kdenlive. | 5.2k / Unlicense |
| `librosa` | Detección de beats → los cortes caen en el compás. | ISC |
| `ffmpeg` | Cortes, reencuadre, zoom, quemado de subtítulos ASS, ducking de música. | — |

## Decisión

Probar **montage-ai** primero con material real antes de escribir nada propio.
Media hora de trabajo frente a semanas: si el resultado ya vale, hemos
terminado; si no, sabremos exactamente qué falta y el plan B parte de un
pliego concreto en vez de una intuición.

## Avisos honestos antes de empezar

1. **Licencia.** montage-ai es PolyForm Noncommercial. Subir reels de viaje por
   gusto entra sin problema; el día que la cuenta se monetice (marca, patrocinio,
   programa de creadores) esa licencia deja de amparar el uso y habría que
   migrar al plan B (todas las piezas del plan B son permisivas: BSD, MIT,
   Unlicense).
2. **47 estrellas** son pocas. Puede tener aristas, romperse en una
   actualización o quedar abandonado. Por eso se prueba antes de construir
   encima.
3. **Yo no puedo ver el vídeo.** Puedo leer la transcripción, los metadatos de
   los clips y los logs, y decidir orden, gancho, texto y ritmo a partir de ahí
   — pero el "esta toma está movida" lo tienes que decir tú. El pipeline no es
   "subo la tarjeta y publico": es "subo la tarjeta, sale un borrador decente,
   reviso 2 minutos".
4. **Claude Pro no incluye créditos de API.** Todo lo que se ejecute aquí es
   local y gratis (Whisper, ffmpeg, librosa). Si algún día se quiere un LLM
   dentro del pipeline sin gasto extra, va con Ollama en tu PC.

## Cómo probarlo (Windows)

Requisitos: **Docker Desktop** con WSL2, 16 GB de RAM recomendados (8 GB
mínimo), 10 GB de disco libre.

```powershell
# 1. Comprobar la máquina
docker --version
docker compose version
(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors

# 2. Clonar y construir (fuera de este repo)
cd $HOME
git clone https://github.com/mfahsold/montage-ai.git
cd montage-ai
docker compose build

# 3. Meter material
#    5-10 clips del mismo viaje (incluye alguno hablando a cámara) + una canción
copy D:\viajes\lisboa\*.mp4 data\input\
copy D:\musica\track.mp3  data\music\
```

Luego lanza el script de esta carpeta, que ya fija los ajustes que nos
interesan (vertical 1080x1920, subtítulos, estilo de corte rápido):

```powershell
.\reels\probar-montage-ai.ps1 -MontagePath $HOME\montage-ai
```

O a mano, si prefieres ver los comandos:

```powershell
# Pasada rápida en 360p para ver si el montaje tiene sentido (~2-5 min)
$env:QUALITY_PROFILE="preview"
$env:EXPORT_WIDTH="1080"; $env:EXPORT_HEIGHT="1920"
$env:CUT_STYLE="viral"; $env:CAPTIONS="true"; $env:TARGET_DURATION="30"
docker compose run --rm montage-ai /app/montage-ai.sh run
```

El resultado sale en `data\output\montage_<timestamp>.mp4`.

### Ajustes que importan

| Variable | Valor | Por qué |
|---|---|---|
| `EXPORT_WIDTH` / `EXPORT_HEIGHT` | `1080` / `1920` | Sin esto infiere la resolución del material dominante y te saca 16:9. |
| `CUT_STYLE` | `viral`, `mtv` o `action` | Los tres estilos de corte rápido. Los otros cinco (`hitchcock`, `documentary`, `minimalist`, `wes_anderson`, `dynamic`) son más pausados. |
| `CAPTIONS` | `true` | Quemado de subtítulos. Documentado solo en el ejemplo "sin dependencias cloud", así que **hay que verificar en la prueba que realmente los pinta**. |
| `TARGET_DURATION` | `30` | Sin esto, el montaje dura lo que dure la canción. |
| `PRESERVE_ASPECT` | `false` | `true` mete letterbox (bandas negras) en vertical: eso mata la retención. |
| `QUALITY_PROFILE` | `preview` | 360p para iterar; quítalo para el render final. |
| `STABILIZE` | `true` | Solo en el render final: el material de viaje va a mano y se nota. |

## Qué comprobar en la prueba (protocolo)

Sobre el clip de salida, marca sí/no:

- [ ] Sale en 1080x1920 real, sin bandas negras
- [ ] Ningún plano dura más de 3 s
- [ ] Los cortes caen en el beat, no a intervalo fijo
- [ ] Los subtítulos aparecen, van sincronizados y están **en español**
- [ ] Los subtítulos van por palabra/grupo corto, no en párrafos
- [ ] Los subtítulos quedan a media altura, no bajo la UI de TikTok
- [ ] En los trozos hablando a cámara, el reencuadre sigue la cara
- [ ] Los silencios y muletillas están fuera
- [ ] No hay fundidos a negro
- [ ] El primer segundo es el plano más fuerte, no el más largo

Con esa lista rellenada sé exactamente qué falta y qué toca construir.

## Si no da la talla — plan B

CLI propia en Python sobre los ladrillos maduros de arriba, ejecutable con un
`.bat`, y yo por detrás decidiendo orden de clips, gancho y copy a partir de la
transcripción y los metadatos. Sin licencia restrictiva y sin depender de un
repo de 47 estrellas.
