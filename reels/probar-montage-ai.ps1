<#
.SYNOPSIS
    Lanza una prueba de montage-ai con los ajustes del pliego de reels de viaje.

.DESCRIPTION
    Fija resolucion vertical, estilo de corte rapido y subtitulos, y lanza el
    render dentro del contenedor. Por defecto hace una pasada en 360p para
    iterar rapido; con -Final sube a calidad completa y activa estabilizacion.

    No clona ni construye nada: eso se hace una sola vez, ver reels/README.md.

.EXAMPLE
    .\probar-montage-ai.ps1 -MontagePath $HOME\montage-ai

.EXAMPLE
    .\probar-montage-ai.ps1 -MontagePath $HOME\montage-ai -Estilo mtv -Duracion 45 -Final
#>
[CmdletBinding()]
param(
    # Carpeta donde esta clonado montage-ai
    [Parameter(Mandatory = $true)]
    [string]$MontagePath,

    # Estilo de corte. viral/mtv/action son los rapidos (< 3s por plano)
    [ValidateSet('viral', 'mtv', 'action', 'dynamic', 'documentary', 'minimalist', 'hitchcock', 'wes_anderson')]
    [string]$Estilo = 'viral',

    # Duracion objetivo en segundos. 0 = lo que dure la cancion
    [int]$Duracion = 30,

    # Calidad completa + estabilizacion, en vez de la pasada rapida en 360p
    [switch]$Final
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -Path $MontagePath -PathType Container)) {
    throw "No existe la carpeta '$MontagePath'. Clona montage-ai primero (ver reels/README.md)."
}

$entrada = Join-Path $MontagePath 'data\input'
$music = Join-Path $MontagePath 'data\music'

foreach ($carpeta in @($entrada, $music)) {
    if (-not (Test-Path -Path $carpeta -PathType Container)) {
        throw "Falta '$carpeta'. Ejecuta el setup de montage-ai antes (ver reels/README.md)."
    }
}

$clips = @(Get-ChildItem -Path $entrada -File -Include *.mp4, *.mov, *.MP4, *.MOV -Recurse)
if ($clips.Count -eq 0) {
    throw "No hay clips en '$entrada'. Copia ahi los videos del viaje."
}

$canciones = @(Get-ChildItem -Path $music -File -Include *.mp3, *.wav, *.m4a -Recurse)
if ($canciones.Count -eq 0) {
    throw "No hay musica en '$music'. Los cortes al beat necesitan una pista."
}

Write-Host "Clips:   $($clips.Count)"   -ForegroundColor Cyan
Write-Host "Musica:  $($canciones.Count)" -ForegroundColor Cyan
Write-Host "Estilo:  $Estilo"           -ForegroundColor Cyan
Write-Host "Modo:    $(if ($Final) { 'final' } else { 'preview 360p' })" -ForegroundColor Cyan

# Formato de salida: vertical real, sin letterbox (las bandas negras matan la retencion)
$env:EXPORT_WIDTH     = '1080'
$env:EXPORT_HEIGHT    = '1920'
$env:PRESERVE_ASPECT  = 'false'

# Montaje
$env:CUT_STYLE        = $Estilo
$env:CAPTIONS         = 'true'
$env:TARGET_DURATION  = "$Duracion"

if ($Final) {
    $env:QUALITY_PROFILE = 'high'
    $env:STABILIZE       = 'true'
    $env:ENHANCE         = 'true'
} else {
    $env:QUALITY_PROFILE = 'preview'
    $env:STABILIZE       = 'false'
    $env:FFMPEG_PRESET   = 'ultrafast'
}

Push-Location $MontagePath
try {
    docker compose run --rm montage-ai /app/montage-ai.sh run
    if ($LASTEXITCODE -ne 0) {
        throw "montage-ai termino con codigo $LASTEXITCODE. Revisa el log de arriba."
    }
} finally {
    Pop-Location
}

$salida = Get-ChildItem -Path (Join-Path $MontagePath 'data\output') -Filter 'montage_*.mp4' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($salida) {
    Write-Host "`nListo: $($salida.FullName)" -ForegroundColor Green
    Write-Host "Repasa la checklist de reels/README.md sobre este clip." -ForegroundColor Green
} else {
    Write-Warning "El render acabo sin error pero no encuentro el .mp4 en data\output."
}
