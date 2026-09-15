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
#   gastos backend      →  :3005
#   gastos frontend     →  :5177
#   ofertas backend     →  :3006
#   ofertas frontend    →  :5178
#   paraisos backend    →  :3007
#   paraisos frontend   →  :5179
#   juegos backend      →  :3008
#   juegos frontend     →  :5180
#   watchlist backend   →  :3009
#   watchlist frontend  →  :5181
#   reparto backend     →  :3010
#   reparto frontend    →  :5182
#   ruta backend        →  :3011
#   ruta frontend       →  :5183
#   pisos backend       →  :3012
#   pisos frontend      →  :5184
#   locales backend     →  :3013
#   finanzas frontend   →  :5187  (sin backend)
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
  warn "  cd gastos\infra; docker compose -f docker-compose.local.yml down"
  warn "  cd ofertas\infra; docker compose -f docker-compose.local.yml down"
  warn "  cd paraisos\infra; docker compose -f docker-compose.local.yml down"
  warn "  cd watchlist\infra; docker compose -f docker-compose.local.yml down"
  warn "  cd reparto\infra; docker compose -f docker-compose.local.yml down"
  warn "  cd ruta\infra; docker compose -f docker-compose.local.yml down"
  warn "  cd pisos\infra; docker compose -f docker-compose.local.yml down"
  warn "  cd locales\infra; docker compose -f docker-compose.local.yml down"
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
    foreach ($key in $envs.Keys) { Set-Item -Path "env:$key" -Value $envs[$key] }
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

info "PostgreSQL (gastos :5435)..."
Set-Location (Join-Path $SCRIPT_DIR "gastos\infra")
docker compose -f docker-compose.local.yml up -d

info "PostgreSQL (ofertas :5436)..."
Set-Location (Join-Path $SCRIPT_DIR "ofertas\infra")
docker compose -f docker-compose.local.yml up -d

info "PostgreSQL (paraisos :5437)..."
Set-Location (Join-Path $SCRIPT_DIR "paraisos\infra")
docker compose -f docker-compose.local.yml up -d

info "PostgreSQL (watchlist :5438)..."
Set-Location (Join-Path $SCRIPT_DIR "watchlist\infra")
docker compose -f docker-compose.local.yml up -d

info "PostgreSQL (reparto :5439)..."
Set-Location (Join-Path $SCRIPT_DIR "reparto\infra")
docker compose -f docker-compose.local.yml up -d

info "PostgreSQL (ruta :5440)..."
Set-Location (Join-Path $SCRIPT_DIR "ruta\infra")
docker compose -f docker-compose.local.yml up -d

info "PostgreSQL (pisos :5441)..."
Set-Location (Join-Path $SCRIPT_DIR "pisos\infra")
docker compose -f docker-compose.local.yml up -d

info "PostgreSQL (locales :5442)..."
Set-Location (Join-Path $SCRIPT_DIR "locales\infra")
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

# ── 5b. Esperar a PostgreSQL (gastos) ────────────────────────────────────────
info "PostgreSQL gastos..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\gastos\infra\docker-compose.local.yml" exec -T gastos-db pg_isready -U gastos -d gastos 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (gastos) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (gastos) listo."

# ── 5c. Esperar a PostgreSQL (ofertas) ───────────────────────────────────────
info "PostgreSQL ofertas..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\ofertas\infra\docker-compose.local.yml" exec -T ofertas-db pg_isready -U ofertas -d ofertas 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (ofertas) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (ofertas) listo."

# ── 5d. Esperar a PostgreSQL (paraisos) ─────────────────────────────────────
info "PostgreSQL paraisos..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\paraisos\infra\docker-compose.local.yml" exec -T paraisos-db pg_isready -U paraisos -d paraisos 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (paraisos) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (paraisos) listo."

# ── 5e. Esperar a PostgreSQL (watchlist) ────────────────────────────────────
info "PostgreSQL watchlist..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\watchlist\infra\docker-compose.local.yml" exec -T watchlist-db pg_isready -U watchlist -d watchlist 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (watchlist) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (watchlist) listo."

# ── 5f. Esperar a PostgreSQL (reparto) ──────────────────────────────────────
info "PostgreSQL reparto..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\reparto\infra\docker-compose.local.yml" exec -T reparto-db pg_isready -U reparto -d reparto 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (reparto) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (reparto) listo."

# ── 5g. Esperar a PostgreSQL (ruta) ─────────────────────────
info "PostgreSQL ruta..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\ruta\infra\docker-compose.local.yml" exec -T ruta-db pg_isready -U ruta -d ruta 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (ruta) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (ruta) listo."

# ── 5h. Esperar a PostgreSQL (pisos) ─────────────────────────
info "PostgreSQL pisos..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\pisos\infra\docker-compose.local.yml" exec -T pisos-db pg_isready -U pisos -d pisos 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (pisos) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (pisos) listo."

# ── 5i. Esperar a PostgreSQL (locales) ─────────────────────────
info "PostgreSQL locales..."
$retries = 30
do {
  $r = docker compose -f "$SCRIPT_DIR\locales\infra\docker-compose.local.yml" exec -T locales-db pg_isready -U locales -d locales 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  $retries--
  if ($retries -le 0) { err "PostgreSQL (locales) no arrancó." }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
} while ($true)
Write-Host ""; info "  ✓ PostgreSQL (locales) listo."

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
     KEYCLOAK_ADMIN_PASSWORD="admin123"; CORS_ORIGIN="http://localhost:5174";
     PANEL_INTERNAL_TOKEN=$(if ($env:PANEL_INTERNAL_TOKEN) { $env:PANEL_INTERNAL_TOKEN } else { "local-dev-panel-internal-token" });
     PARAISOS_BACKEND_URL="http://localhost:3007"; WATCHLIST_BACKEND_URL="http://localhost:3009" }

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

# Gastos backend
EnsureDeps (Join-Path $SCRIPT_DIR "gastos\backend")
StartBackground "gastos-backend    :3005" "gastos-backend.log" `
  (Join-Path $SCRIPT_DIR "gastos\backend") `
  "npm run dev" `
  @{ PORT="3005"; GASTOS_DB_HOST="localhost"; GASTOS_DB_PORT="5435";
     GASTOS_DB_NAME="gastos"; GASTOS_DB_USER="gastos"; GASTOS_DB_PASSWORD="gastos123";
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5177";
     GASTOS_IMAGES_PATH=(Join-Path $SCRIPT_DIR "gastos\backend\data\images");
     TELEGRAM_BOT_TOKEN=$env:TELEGRAM_BOT_TOKEN; TELEGRAM_OWNER_CHAT_ID=$env:TELEGRAM_OWNER_CHAT_ID }

# Ofertas backend
EnsureDeps (Join-Path $SCRIPT_DIR "ofertas\backend")
StartBackground "ofertas-backend   :3006" "ofertas-backend.log" `
  (Join-Path $SCRIPT_DIR "ofertas\backend") `
  "npm run dev" `
  @{ PORT="3006"; OFERTAS_DB_HOST="localhost"; OFERTAS_DB_PORT="5436";
     OFERTAS_DB_NAME="ofertas"; OFERTAS_DB_USER="ofertas"; OFERTAS_DB_PASSWORD="ofertas123";
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5178";
     SCRAPER_API_KEY=$(if ($env:SCRAPER_API_KEY) { $env:SCRAPER_API_KEY } else { "local-dev-scraper-key" }) }

# Paraisos backend
EnsureDeps (Join-Path $SCRIPT_DIR "paraisos\backend")
StartBackground "paraisos-backend  :3007" "paraisos-backend.log" `
  (Join-Path $SCRIPT_DIR "paraisos\backend") `
  "npm run dev" `
  @{ PORT="3007"; PARAISOS_DB_HOST="localhost"; PARAISOS_DB_PORT="5437";
     PARAISOS_DB_NAME="paraisos"; PARAISOS_DB_USER="paraisos"; PARAISOS_DB_PASSWORD="paraisos123";
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5179";
     PARAISOS_IMAGES_PATH=(Join-Path $SCRIPT_DIR "paraisos\backend\data\images");
     ORS_API_KEY=$env:ORS_API_KEY;
     PANEL_INTERNAL_TOKEN=$(if ($env:PANEL_INTERNAL_TOKEN) { $env:PANEL_INTERNAL_TOKEN } else { "local-dev-panel-internal-token" }) }

# Watchlist backend
EnsureDeps (Join-Path $SCRIPT_DIR "watchlist\backend")
StartBackground "watchlist-backend :3009" "watchlist-backend.log" `
  (Join-Path $SCRIPT_DIR "watchlist\backend") `
  "npm run dev" `
  @{ PORT="3009"; WATCHLIST_DB_HOST="localhost"; WATCHLIST_DB_PORT="5438";
     WATCHLIST_DB_NAME="watchlist"; WATCHLIST_DB_USER="watchlist"; WATCHLIST_DB_PASSWORD="watchlist123";
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5181";
     TMDB_API_KEY=$env:TMDB_API_KEY; GOOGLE_BOOKS_API_KEY=$env:GOOGLE_BOOKS_API_KEY;
     PANEL_INTERNAL_TOKEN=$(if ($env:PANEL_INTERNAL_TOKEN) { $env:PANEL_INTERNAL_TOKEN } else { "local-dev-panel-internal-token" }) }

# Juegos backend
EnsureDeps (Join-Path $SCRIPT_DIR "juegos\backend")
StartBackground "juegos-backend    :3008" "juegos-backend.log" `
  (Join-Path $SCRIPT_DIR "juegos\backend") `
  "npm run dev" `
  @{ PORT="3008"; KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5180" }

# Reparto backend
EnsureDeps (Join-Path $SCRIPT_DIR "reparto\backend")
StartBackground "reparto-backend   :3010" "reparto-backend.log" `
  (Join-Path $SCRIPT_DIR "reparto\backend") `
  "npm run dev" `
  @{ PORT="3010"; REPARTO_DB_HOST="localhost"; REPARTO_DB_PORT="5439";
     REPARTO_DB_NAME="reparto"; REPARTO_DB_USER="reparto"; REPARTO_DB_PASSWORD="reparto123";
     REPARTO_GROUP_TOKEN_SECRET=$(if ($env:REPARTO_GROUP_TOKEN_SECRET) { $env:REPARTO_GROUP_TOKEN_SECRET } else { "local-dev-reparto-secret" });
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5182" }

# Ruta backend
EnsureDeps (Join-Path $SCRIPT_DIR "ruta\backend")
StartBackground "ruta-backend      :3011" "ruta-backend.log" `
  (Join-Path $SCRIPT_DIR "ruta\backend") `
  "npm run dev" `
  @{ PORT="3011"; RUTA_DB_HOST="localhost"; RUTA_DB_PORT="5440";
     RUTA_DB_NAME="ruta"; RUTA_DB_USER="ruta"; RUTA_DB_PASSWORD="ruta123";
     ORS_API_KEY=$(if ($env:ORS_API_KEY) { $env:ORS_API_KEY } else { "" });
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5183" }

# Pisos backend
# PISOS_INTERVALO_MINUTOS alto en local a proposito: en desarrollo se usa el
# boton "Buscar ahora", no hace falta golpear los portales de fondo.
EnsureDeps (Join-Path $SCRIPT_DIR "pisos\backend")
StartBackground "pisos-backend     :3012" "pisos-backend.log" `
  (Join-Path $SCRIPT_DIR "pisos\backend") `
  "npm run dev" `
  @{ PORT="3012"; PISOS_DB_HOST="localhost"; PISOS_DB_PORT="5441";
     PISOS_DB_NAME="pisos"; PISOS_DB_USER="pisos"; PISOS_DB_PASSWORD="pisos123";
     PISOS_INTERVALO_MINUTOS=$(if ($env:PISOS_INTERVALO_MINUTOS) { $env:PISOS_INTERVALO_MINUTOS } else { "60" });
     TELEGRAM_BOT_TOKEN=$(if ($env:TELEGRAM_BOT_TOKEN) { $env:TELEGRAM_BOT_TOKEN } else { "" });
     TELEGRAM_OWNER_CHAT_ID=$(if ($env:TELEGRAM_OWNER_CHAT_ID) { $env:TELEGRAM_OWNER_CHAT_ID } else { "" });
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5184" }

EnsureDeps (Join-Path $SCRIPT_DIR "locales\backend")
# Hasta importar el padron (npm run padron -- madrid) toda comprobacion
# devuelve "sin datos". Es lo correcto: un padron vacio no demuestra que no
# haya farmacias cerca.
StartBackground "locales-backend   :3013" "locales-backend.log" `
  (Join-Path $SCRIPT_DIR "locales\backend") `
  "npm run dev" `
  @{ PORT="3013"; LOCALES_DB_HOST="localhost"; LOCALES_DB_PORT="5442";
     LOCALES_DB_NAME="locales"; LOCALES_DB_USER="locales"; LOCALES_DB_PASSWORD="locales123";
     LOCALES_MOTOR_DISTANCIA=$(if ($env:LOCALES_MOTOR_DISTANCIA) { $env:LOCALES_MOTOR_DISTANCIA } else { "ors" });
     ORS_API_KEY=$(if ($env:ORS_API_KEY) { $env:ORS_API_KEY } else { "" });
     VALHALLA_URL=$(if ($env:VALHALLA_URL) { $env:VALHALLA_URL } else { "http://localhost:8002" });
     TELEGRAM_BOT_TOKEN=$(if ($env:TELEGRAM_BOT_TOKEN) { $env:TELEGRAM_BOT_TOKEN } else { "" });
     TELEGRAM_OWNER_CHAT_ID=$(if ($env:TELEGRAM_OWNER_CHAT_ID) { $env:TELEGRAM_OWNER_CHAT_ID } else { "" });
     KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs";
     CORS_ORIGIN="http://localhost:5185" }

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

EnsureDeps (Join-Path $SCRIPT_DIR "gastos\frontend")
StartBackground "gastos-frontend    :5177" "gastos-frontend.log" `
  (Join-Path $SCRIPT_DIR "gastos\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "ofertas\frontend")
StartBackground "ofertas-frontend   :5178" "ofertas-frontend.log" `
  (Join-Path $SCRIPT_DIR "ofertas\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "paraisos\frontend")
StartBackground "paraisos-frontend  :5179" "paraisos-frontend.log" `
  (Join-Path $SCRIPT_DIR "paraisos\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "juegos\frontend")
StartBackground "juegos-frontend    :5180" "juegos-frontend.log" `
  (Join-Path $SCRIPT_DIR "juegos\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "watchlist\frontend")
StartBackground "watchlist-frontend :5181" "watchlist-frontend.log" `
  (Join-Path $SCRIPT_DIR "watchlist\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "reparto\frontend")
StartBackground "reparto-frontend   :5182" "reparto-frontend.log" `
  (Join-Path $SCRIPT_DIR "reparto\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "ruta\frontend")
StartBackground "ruta-frontend      :5183" "ruta-frontend.log" `
  (Join-Path $SCRIPT_DIR "ruta\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "pisos\frontend")
StartBackground "pisos-frontend     :5184" "pisos-frontend.log" `
  (Join-Path $SCRIPT_DIR "pisos\frontend") "npm run dev"

EnsureDeps (Join-Path $SCRIPT_DIR "finanzas\frontend")
StartBackground "finanzas-frontend  :5187" "finanzas-frontend.log" `
  (Join-Path $SCRIPT_DIR "finanzas\frontend") "npm run dev"

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
Write-Host "  Gastos" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5177/gastos/"
Write-Host "    Backend health   ->  http://localhost:3005/gastos/api/health"
Write-Host "    Bot de Telegram deshabilitado hasta configurar TELEGRAM_BOT_TOKEN/TELEGRAM_OWNER_CHAT_ID (ver gastos/README.md)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Ofertas" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5178/ofertas/"
Write-Host "    Backend health   ->  http://localhost:3006/ofertas/api/health"
Write-Host "    SCRAPER_API_KEY de desarrollo por defecto: local-dev-scraper-key (sobrescribible con la env var)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Paraisos Naturales" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5179/paraisos/"
Write-Host "    Backend health   ->  http://localhost:3007/paraisos/api/health"
Write-Host ""
Write-Host "  Juegos" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5180/juegos/"
Write-Host "    Backend health   ->  http://localhost:3008/juegos/api/health"
Write-Host ""
Write-Host "  Watchlist" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5181/watchlist/"
Write-Host "    Backend health   ->  http://localhost:3009/watchlist/api/health"
Write-Host "    Búsqueda TMDB/Google Books deshabilitada hasta configurar TMDB_API_KEY/GOOGLE_BOOKS_API_KEY" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Reparto" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5182/reparto/"
Write-Host "    Backend health   ->  http://localhost:3010/reparto/api/health"
Write-Host "    REPARTO_GROUP_TOKEN_SECRET de desarrollo por defecto: local-dev-reparto-secret (sobrescribible con la env var)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Ruta" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5183/ruta/"
Write-Host "    Backend health   ->  http://localhost:3011/ruta/api/health"
Write-Host "    Sin ORS_API_KEY la busqueda devuelve 503: exporta la variable antes de arrancar (clave gratuita en openrouteservice.org)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Pisos" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5184/pisos/"
Write-Host "    Backend health   ->  http://localhost:3012/pisos/api/health"
Write-Host "    Sin TELEGRAM_BOT_TOKEN/TELEGRAM_OWNER_CHAT_ID rastrea y guarda, pero no avisa al movil" -ForegroundColor Yellow
Write-Host "    Comprobar los portales reales:  cd pisos\backend; npm run smoke -- todos \"Badajoz\"" -ForegroundColor Yellow

Write-Host ""
Write-Host "  Locales (sin frontend todavia)"
Write-Host "    Backend health   ->  http://localhost:3013/locales/api/health"
Write-Host "    Importar el padron antes de usarlo:  cd locales\backend; npm run padron -- madrid" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Finanzas (sin backend, calculadoras puras en el navegador)" -ForegroundColor Cyan
Write-Host "    Frontend         ->  http://localhost:5187/finanzas/"
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
