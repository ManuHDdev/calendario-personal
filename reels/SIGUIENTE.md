# Por dónde seguir

Documento de traspaso. Lo que hay, lo que falta, y por qué las cosas están
como están para que no haya que volver a deducirlo.

---

## 1. Arrancar en tu PC

```powershell
git clone https://github.com/ManuHDdev/calendario-personal.git
cd calendario-personal
git checkout claude/auto-video-editing-social-45iz09
cd reels
```

**ffmpeg** tiene que estar en el PATH. En Windows:

```powershell
winget install Gyan.FFmpeg
# cierra y reabre la terminal, y comprueba:
ffmpeg -version
```

**Dependencias de Python** (3.10 o superior):

```powershell
pip install -r requirements.txt
```

**Comprueba que la instalación funciona** antes de gastar tiempo con material
real. Esto genera clips sintéticos, monta un reel y mide el resultado:

```powershell
python probar.py
```

Tiene que terminar con `Todo correcto. La instalación funciona.` y cuatro `[OK]`.
Si quieres ver el reel de prueba, añade `--conservar` y queda en `reels/prueba/`.

**Primer reel de verdad:**

```powershell
python montar.py --clips D:\viajes\lisboa --musica D:\musica\track.mp3 --salida reel.mp4
```

La primera vez descarga el modelo de Whisper (~500 MB con `small`). Para iterar
el montaje sin esperar a la transcripción, usa `--sin-subtitulos`.

---

## 2. Qué está hecho y verificado

Medido sobre el fichero de salida, no a ojo (ver tabla completa en `README.md`):
1080x1920 a 30 fps, plano más largo 1,03 s frente al techo de 2,5 s, punch-in
confirmado sobre fuente estática, subtítulos karaoke quemados al 60% de altura,
y los 5 clips de prueba usados.

**Lo que NO he podido ejecutar:** la transcripción. El proxy del entorno donde
trabajé bloquea la descarga del modelo desde HuggingFace. El código está
escrito y el generador de subtítulos verificado con una transcripción de
prueba, pero **la primera ejecución real de `transcripcion.py` la haces tú**.
Es el punto con más probabilidad de dar guerra.

---

## 3. Lo siguiente, por orden de impacto

### a) Eliminación de silencios y muletillas — *la carencia que más se nota*

Dijiste que tus vídeos son mezcla de plano a cámara y recurso. Ahora mismo los
tramos hablando se cortan al beat como si fueran recurso: los silencios, las
dudas y los "ehhh" se quedan dentro.

Dónde: un módulo nuevo `pipeline/silencios.py` que corra antes de
`construir_plan`. Dos caminos:

- `ffmpeg -af silencedetect=noise=-30dB:d=0.35` y parsear los tramos del log.
  Cero dependencias nuevas, y es lo que hace [auto-editor](https://github.com/WyattBlue/auto-editor)
  por dentro.
- Reutilizar el VAD que `faster-whisper` ya trae (`vad_filter=True`), que da los
  tramos con voz gratis si de todas formas vas a transcribir.

La segunda es más elegante pero obliga a transcribir **antes** de montar, y eso
choca con la decisión de la sección 4. Piénsalo antes de escribir código.

### b) Seguimiento de cara en el recorte a 9:16

Ahora el recorte es al centro (`pipeline/render.py`, función `_filtro_plano`).
Si te grabas descentrado, te sales del encuadre.

Dónde: detectar la cara cada N fotogramas y mover el `crop`. MediaPipe o el
clasificador Haar de OpenCV bastan. Ojo: `crop` de ffmpeg admite expresiones
con `t`, así que se puede desplazar sin partir el plano en trozos.

Solo aplica a los planos hablando a cámara. En el recurso, el centro está bien.

### c) Texto de gancho en el primer segundo

Ya se elige como primer plano el de más movimiento, que es la mitad del truco.
Falta el rótulo ("Nadie te cuenta esto de Lisboa") superpuesto.

Dónde: `pipeline/subtitulos.py` ya genera ASS; añadir un evento `Dialogue` con
`\pos` arriba y un `\fad` corto es de las cosas más baratas de la lista.

### d) Varias versiones de un mismo material

Montar 3 reels con distinta semilla y quedarte con el que mejor te encaje.
Barato de implementar (un `--variantes N` que cambie el orden de reparto) y
sube mucho la probabilidad de acertar con uno.

---

## 4. Decisiones de diseño y por qué

Si vas a cambiar algo de esto, que sea a sabiendas:

**Se transcribe el montaje ya concatenado, no los clips sueltos.** Es lo que
hace que los subtítulos cuadren siempre: las marcas salen ya en la línea de
tiempo final, sin reproyectar los tiempos de cada recorte. El precio es que la
transcripción no puede guiar el montaje — si algún día quieres cortar según lo
que dices, hay que invertir este orden y asumir la reproyección.

**Se renderiza plano a plano a intermedios y luego se concatena**, en vez de un
único `filter_complex` gigante. Es algo más lento, pero cuando un plano falla se
ve cuál, y el fallo no se lleva por delante el reel entero.

**Los cortes van al beat, no a intervalo fijo.** Un corte a 2,0 s exactos se lee
como mecánico; el mismo corte sobre el golpe de la batería se lee como
intencionado aunque el espectador no sepa por qué. El techo de `--max-plano` se
fuerza igualmente: con una canción lenta, dos beats pueden pasar de 3 segundos.

**El silencio en los planos sin audio no es decorativo.** El concatenado de
ffmpeg necesita que todos los intermedios tengan las mismas pistas, o descarta
el audio a partir del primero que no la traiga.

**Punch-in del 8% en todos los planos.** Suficiente para que nada quede quieto,
poco para que no se lea como un zoom. Se escala a 1,3x antes de aplicarlo para
que el recorte no pierda nitidez.

**Subtítulos al 60% de altura, grupos de 2-3 palabras.** La interfaz de
TikTok/Reels tapa el tercio inferior con el texto del autor y los botones. Y en
grupos cortos el ojo lee de un vistazo y vuelve a la imagen.

---

## 5. Callejones sin salida ya explorados

**No vuelvas a mirar montage-ai.** Lo evalué leyendo su código, no su README:

- `src/montage_ai/transcriber.py` declara *"Audio transcription via Whisper on
  cgpu"*, y `Transcriber.is_available()` no es más que `is_cgpu_available()`.
- En su `requirements.txt` no hay ningún Whisper local: ni `openai-whisper`, ni
  `faster-whisper`, ni `torch`.
- No existe variable de entorno para pasarle un `.srt` propio: solo `CAPTIONS` y
  `CAPTIONS_STYLE`.

Los subtítulos dependen de [cgpu](https://github.com/RohanAdwankar/cgpu), una
CLI de 145 estrellas que rebusca GPU gratuita en la nube. Más la licencia
PolyForm Noncommercial, que deja de amparar el uso el día que la cuenta se
monetice. `probar-montage-ai.ps1` sigue en la carpeta por si quieres verlo con
tus propios ojos; usa `CUT_STYLE=viral`, **no** `travel` (en `travel.json`,
`min_cut_beats=2` y `max_cut_beats=8` dan planos de hasta 4 s a 120 BPM y mete
crossfades de 0,5 s).

**openshorts y ClipsAI resuelven otro problema**: vídeo largo hablando a cámara
→ recorte del mejor momento. No montan 40 clips de un viaje. Siguen siendo la
referencia si algún día grabas un formato de una sola toma larga.

---

## 6. Trampas del entorno con las que me topé

- **librosa devuelve 0 beats en pistas sin transitorios claros** (ambient, o un
  seno con tremolo). El código cae a rejilla regular en vez de reventar, pero si
  ves el aviso `solo N beats detectables`, el montaje ha perdido la sincronía:
  cambia de canción.
- **`probar.py` necesita percusión de verdad** en la pista sintética. Ya la
  genera con bombo y charles; no la simplifiques a un seno con tremolo o la
  prueba medirá el camino de emergencia en vez del normal.
- **La detección de escena para medir los cortes da falsos positivos** en los
  primeros fotogramas. `probar.py` descarta los intervalos por debajo de 0,2 s.
- **El `.gitignore` de `reels/`** excluye `__pycache__` y `prueba/`. Si añades
  material de vídeo a la carpeta, añádelo también: este repo no es sitio para
  ficheros de cientos de MB.
