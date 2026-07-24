# ─────────────────────────────────────────────────────────────────────────────
# start-local.ps1  —  Arranca TODAS las subaplicaciones en local (Windows)
# Uso: .\start-local.ps1
#
# Puertos:
#   Keycloak            →  :8080
#   PostgreSQL          →  :5433  (calendario)
#   PostgreSQL          →  :5434  (mapacyd)
#   calendario backend  →  :8081  | Swagger: :8081/swagger-ui.html
#   calendario frontend →  :4200
#   panel backend       →  :3002
#   panel frontend      →  :5174
#   storage backend     →  :3001
#   storage frontend    →  :5173
#   mapacyd backend     →  :3003
#   mapacyd frontend    →  :5175
#   ytdl backend        →  :3004
#   ytdl frontend       →  :5176
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"

$SCRIPT_DIR        = Split-Path -Parent $MyInvocation.MyCommand.Path
$INFRA_DIR         = Join-Path $SCRIPT_DIR "infra"
$LOGS_DIR          = Join-Path $SCRIPT_DIR "logs\local"
$STORAGE_DATA_DIR  = Join-Path $SCRIPT_DIR "storage\storage-data"

function info($msg)   { Write-Host "[INFO]  $msg" -ForegroundColor Green }
function warn($msg)   { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function err($msg)    { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }
function header($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }

$Jobs = @()

function Cleanup {
  Write-Host "`n[STOP]  Deteniendo procesos en segundo plano..." -ForegroundColor Yellow
  $Jobs | ForEach-Object { Stop-Job $_ -ErrorAction SilentlyContinue; Remove-Job $_ -ErrorAction SilentlyContinue }
  warn "La infraestructura Docker sigue corriendo. Para pararla:"
  warn "  cd infra; docker compose down"
  warn "  cd mapacyd\infra; docker compose -f docker-compose.local.yml down"
}

# Registrar cleanup al salir
Register-EngineEvent PowerShell.Exiting -Action { Cleanup } | Out-Null

function EnsureDeps($dir) {
  if (-not (Test-Path (Join-Path $dir "node_modules"))) {
    info "  Instalando dependencias en $dir..."
    npm --prefix $dir install --silent
  }
}

function StartBackground($name, $logfile, $workdir, $cmd, $envVars = @{}) {
  $logPath = Join-Path $LOGS_DIR $logfile
  $job = Start-Job -ScriptBlock {
    param($wd, $command, $envs, $log)
    Set-Location $wd
    foreach ($key in $envs.Keys) { $env:($key) = $envs[$key] }
    Invoke-Expression $command 2>&1 | Tee-Object -FilePath $log -Append
  } -ArgumentList $workdir, $cmd, $envVars, $logPath
  $script:Jobs += $job
  info "  ✓ $name  (Job $($job.Id)  →  logs\local\$logfile)"
}

# ── 1. Comprobar requisitos ───────────────────────────────────────────────────
header "Verificando requisitos"
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) { err "Docker no está arrancado. Abre Docker Desktop primero." }
try { mvn --version > $null 2>&1 } catch { err "'mvn' no encontrado. Instala JDK 17 + Maven." }
try { npm --version > $null 2>&1 } catch { err "'npm' no encontrado. Instala Node.js LTS." }
info "Docker, Maven y npm encontrados."

# ── 2. Preparar directorios ───────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $LOGS_DIR      | Out-Null
New-Item -ItemType Directory -Force -Path $STORAGE_DATA_DIR | Out-Null

# ── 3. Levantar infraestructura Docker ───────────────────────────────────────
header "Levantando infraestructura Docker"
info "PostgreSQL (calendario :5433) y Keycloak (:8080)..."
Set-Location $INFRA_DIR
docker compose up -d postgres keycloak

info "PostgreSQL (mapacyd :5434)..."
Set-Location (Join-Path $SCRIPT_DIR "mapacyd\infra")
docker compose -f docker-compose.local.yml up -d

Set-Location $SCRIPT_DIR

# ── 4. Esperar a PostgreSQL (calendario) ─────────────────────────────────────
header "Esperando servicios"
info "PostgreSQL calendario..."
$retries = 30
do {
  $r = docker compose -f "$INFRA_DIR\docker-compose.yml" exec -T postgres pg_isready -U calendariodb -d calendario 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (calendario) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (calendario) listo."

# ── 5. Esperar a PostgreSQL (mapacyd) ────────────────────────────────────────
info "PostgreSQL mapacyd..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\mapacyd\infra\docker-compose.local.yml" exec -T mapacyd-db pg_isready -U mapacyd -d mapacyd 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (mapacyd) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (mapacyd) listo."

# ── 6. Esperar a Keycloak ────────────────────────────────────────────────────
info "Keycloak (puede tardar ~30s la primera vez)..."
$retries = 45
do {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:8080/realms/master" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($resp.StatusCode -eq 200) { break }
  } catch {}
  $retries--
  if ($retries -le 0) { err "Keycloak no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ Keycloak listo."

# ── 7. Arrancar backends ──────────────────────────────────────────────────────
header "Arrancando backends"

# Panel backend
EnsureDeps (Join-Path $SCRIPT_DIR "panel\backend")
StartBackground "panel-backend     :3002" "panel-backend.log" `
  (Join-Path $SCRIPT_DIR "panel\backend") `
  "npm run dev" `
  @{ PORT="3002"; KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     KEYCLOAK_BASE_URL="http://localhost:8080"; KEYCLOAK_ADMIN="admin";
     KEYCLOAK_ADMIN_PASSWORD="admin123"; CORS_ORIGIN="http://localhost:5174" }

# Storage backend
EnsureDeps (Join-Path $SCRIPT_DIR "storage\backend")
StartBackground "storage-backend   :3001" "storage-backend.log" `
  (Join-Path $SCRIPT_DIR "storage\backend") `
  "npm run dev" `
  @{ PORT="3001"; STORAGE_PATH=$STORAGE_DATA_DIR;
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     KEYCLOAK_BASE_URL="http://localhost:8080"; KEYCLOAK_ADMIN="admin";
     KEYCLOAK_ADMIN_PASSWORD="admin123" }

# Mapacyd backend
EnsureDeps (Join-Path $SCRIPT_DIR "mapacyd\backend")
StartBackground "mapacyd-backend   :3003" "mapacyd-backend.log" `
  (Join-Path $SCRIPT_DIR "mapacyd\backend") `
  "npm run dev" `
  @{ PORT="3003"; MAPACYD_DB_HOST="localhost"; MAPACYD_DB_PORT="5434";
     MAPACYD_DB_NAME="mapacyd"; MAPACYD_DB_USER="mapacyd"; MAPACYD_DB_PASSWORD="mapacyd123";
     KEYCLOAK_JWKS_URI="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ALLOWED_ORIGINS="http://localhost:5175" }

# ytdl backend
EnsureDeps (Join-Path $SCRIPT_DIR "ytdl\backend")
StartBackground "ytdl-backend      :3004" "ytdl-backend.log" `
  (Join-Path $SCRIPT_DIR "ytdl\backend") `
  "npm run dev" `
  @{ PORT="3004"; KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5176" }

# Calendario backend (Spring Boot)
StartBackground "calendario-backend :8081" "calendario-backend.log" `
  (Join-Path $SCRIPT_DIR "backend") `
  "mvn spring-boot:run -Dspring-boot.run.profiles=dev"

# ── 8. Arrancar frontends ─────────────────────────────────────────────────────
header "Arrancando frontends"

EnsureDeps (Join-Path $SCRIPT_DIR "panel\frontend")
StartBackground "panel-frontend     :5174" "panel-frontend.log" `
  (Join-Path $SCRIPT_DIR "panel\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "storage\frontend")
StartBackground "storage-frontend   :5173" "storage-frontend.log" `
  (Join-Path $SCRIPT_DIR "storage\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "mapacyd\frontend")
StartBackground "mapacyd-frontend   :5175" "mapacyd-frontend.log" `
  (Join-Path $SCRIPT_DIR "mapacyd\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "ytdl\frontend")
StartBackground "ytdl-frontend      :5176" "ytdl-frontend.log" `
  (Join-Path $SCRIPT_DIR "ytdl\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "calendario-frontend")
StartBackground "calendario-frontend :4200" "calendario-frontend.log" `
  (Join-Path $SCRIPT_DIR "calendario-frontend") "npm start"

# ── 9. Resumen ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║         ✅  EL BUNKER — LOCAL DEV STACK ACTIVO           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Infraestructura" -ForegroundColor Cyan
Write-Host "    Keycloak Admin   ->  http://localhost:8080/admin  (admin / admin123)"
Write-Host "    PostgreSQL       ->  localhost:5433  (calendario)"
Write-Host "    PostgreSQL       ->  localhost:5434  (mapacyd)"
Write-Host ""
Write-Host "  Calendario" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:4200"
Write-Host "    Backend API      ->  http://localhost:8081"
Write-Host "    Swagger UI       ->  http://localhost:8081/swagger-ui.html"
Write-Host ""
Write-Host "  Panel de administración" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5174/panel/"
Write-Host "    Backend health   ->  http://localhost:3002/panel/api/health"
Write-Host ""
Write-Host "  Storage NAS" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5173/storage/"
Write-Host "    Backend health   ->  http://localhost:3001/storage/api/health"
Write-Host "    Datos locales    ->  $STORAGE_DATA_DIR"
Write-Host ""
Write-Host "  MapaCYD" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5175/mapacyd/"
Write-Host "    Backend health   ->  http://localhost:3003/health"
Write-Host ""
Write-Host "  YouTube Downloader" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5176/ytdl/"
Write-Host "    Backend health   ->  http://localhost:3004/ytdl/api/health"
Write-Host ""
Write-Host "  Logs  ->  $LOGS_DIR\" -ForegroundColor Yellow
Write-Host "  El backend de Spring Boot puede tardar ~30-60s en estar listo." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener todos los procesos." -ForegroundColor Red
Write-Host ""

# Mantener vivo hasta Ctrl+C
try {
  while ($true) { Start-Sleep -Seconds 5 }
} finally {
  Cleanup
}
