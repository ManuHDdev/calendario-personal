@echo off
REM Montaje de un reel desde Windows. Ajusta las rutas y ejecuta con doble clic.
REM Requiere: Python 3.10+, ffmpeg en el PATH y "pip install -r requirements.txt".

setlocal
set CLIPS=D:\viajes\lisboa
set MUSICA=D:\musica\track.mp3
set SALIDA=%USERPROFILE%\Desktop\reel.mp4

python "%~dp0montar.py" --clips "%CLIPS%" --musica "%MUSICA%" --salida "%SALIDA%" --duracion 30
if errorlevel 1 (
  echo.
  echo El montaje ha fallado. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo.
echo Reel listo en %SALIDA%
pause
