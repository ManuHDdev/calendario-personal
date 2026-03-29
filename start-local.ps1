# ─────────────────────────────────────────────────────────────────────────────
# start-local.ps1  —  Arranca infraestructura + backend para desarrollo local
# Uso: .\start-local.ps1
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"

$SCRIPT_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$INFRA_DIR   = Join-Path $SCRIPT_DIR "infra"
$BACKEND_DIR = Join-Path $SCRIPT_DIR "backend"

function info($msg)  { Write-Host "[INFO] $msg" -ForegroundColor Green }
function warn($msg)  { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function err($msg)   { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# ── 1. Comprobar Docker ──────────────────────────────────────────────────────
info "Verificando Docker..."
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) { err "Docker no está arrancado. Abre Docker Desktop primero." }

# ── 2. Levantar infraestructura ──────────────────────────────────────────────
info "Levantando PostgreSQL y Keycloak..."
Set-Location $INFRA_DIR
docker compose up -d postgres keycloak

# ── 3. Esperar a PostgreSQL ──────────────────────────────────────────────────
info "Esperando a que PostgreSQL esté listo..."
$retries = 30
do {
    $ready = docker compose exec -T postgres pg_isready -U calendariodb -d calendario 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    $retries--
    if ($retries -le 0) { err "PostgreSQL no arrancó tras 60s. Revisa: docker compose logs postgres" }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 2
} while ($true)
Write-Host ""
info "PostgreSQL listo."

# ── 4. Esperar a Keycloak ────────────────────────────────────────────────────
info "Esperando a que Keycloak esté listo (puede tardar ~30s la primera vez)..."
$retries = 45
do {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8080/realms/master" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -eq 200) { break }
    } catch {}
    $retries--
    if ($retries -le 0) { err "Keycloak no arrancó tras 90s. Revisa: docker compose logs keycloak" }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 2
} while ($true)
Write-Host ""
info "Keycloak listo."

# ── 5. Arrancar backend ──────────────────────────────────────────────────────
info "Arrancando backend Spring Boot (perfil dev)..."
info "  -> API:     http://localhost:8081"
info "  -> Swagger: http://localhost:8081/swagger-ui.html"
info "  Ctrl+C para parar"
Write-Host ""

Set-Location $BACKEND_DIR
mvn spring-boot:run "-Dspring-boot.run.profiles=dev"
