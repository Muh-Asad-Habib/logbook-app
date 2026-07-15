# ============================================================
#  Logbook Kegiatan & Keuangan - start.ps1
#  Jalankan:   .\start.ps1
#  Hasil:      URL publik https://xxxx.trycloudflare.com yang bisa
#              dibuka SIAPA SAJA di internet (tanpa kirim kode).
#
#  Opsi:
#    .\start.ps1 -NoTunnel   -> hanya lokal/LAN (tanpa internet)
#    .\start.ps1 -Rebuild    -> build ulang frontend
# ============================================================
param(
    [switch]$NoTunnel,
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 4000
$logServer = Join-Path $env:TEMP "logbook_server.log"
$logTunnel = Join-Path $env:TEMP "logbook_tunnel.log"
$urlFile = Join-Path $root "data\tunnel_url.txt"

function Judul($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

# ---------- 0. Bersihkan proses lama (penyebab umum "tidak merespons") ----------
$lama = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($lama) {
    Write-Host "Menutup proses lama di port $port..." -ForegroundColor Yellow
    $lama | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $urlFile -Force -ErrorAction SilentlyContinue

# ---------- 1. Cek Node.js ----------
Judul "Cek Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js belum terpasang. Unduh dari https://nodejs.org (LTS), lalu jalankan ulang skrip ini." -ForegroundColor Red
    exit 1
}
Write-Host "Node $(node --version) OK"

# ---------- 1b. Cek file .env (wajib sejak v3 — data di Neon + ImageKit) ----------
if (-not (Test-Path "$root\.env")) {
    Write-Host ""
    Write-Host "File .env belum ada!" -ForegroundColor Red
    Write-Host "Sejak v3, data tersimpan di cloud (Neon + ImageKit)." -ForegroundColor Yellow
    Write-Host "Salin .env.example menjadi .env lalu isi nilainya:" -ForegroundColor Yellow
    Write-Host "    Copy-Item .env.example .env ; notepad .env" -ForegroundColor Cyan
    Write-Host "Panduan lengkap: DEPLOY.md" -ForegroundColor Yellow
    exit 1
}

# ---------- 2. Dependensi backend ----------
Judul "Backend"
if (-not (Test-Path "$root\backend\node_modules")) {
    Write-Host "Memasang dependensi backend (sekali saja)..."
    Push-Location "$root\backend"; npm install --silent; Pop-Location
}
Write-Host "Backend siap"

# ---------- 3. Build frontend ----------
Judul "Frontend"
if ($Rebuild -or -not (Test-Path "$root\frontend\out\index.html")) {
    if (-not (Test-Path "$root\frontend\node_modules")) {
        Write-Host "Memasang dependensi frontend (sekali saja)..."
        Push-Location "$root\frontend"; npm install --silent; Pop-Location
    }
    Write-Host "Mem-build frontend..."
    Push-Location "$root\frontend"; npm run build; Pop-Location
}
Write-Host "Frontend siap (frontend/out)"

# ---------- 4. Jalankan server (log ke file agar error terlihat) ----------
Judul "Server"
Remove-Item $logServer -Force -ErrorAction SilentlyContinue
$server = Start-Process node -ArgumentList "src/server.js" -WorkingDirectory "$root\backend" `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $logServer -RedirectStandardError "$logServer.err"
Write-Host "Server dimulai (PID $($server.Id)) - menunggu siap..."
$siap = $false
foreach ($i in 1..30) {
    if ($server.HasExited) { break }
    $tcp = New-Object Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", $port)
        if ($tcp.Connected) { $siap = $true }
    } catch {}
    $tcp.Close()
    if ($siap) { break }
    Start-Sleep -Seconds 1
}
if (-not $siap) {
    Write-Host "`nServer GAGAL berjalan. Log error:" -ForegroundColor Red
    Get-Content $logServer, "$logServer.err" -ErrorAction SilentlyContinue |
        Select-Object -Last 25 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "  Aplikasi   : http://localhost:$port" -ForegroundColor Green
Write-Host "  API Docs   : http://localhost:$port/docs" -ForegroundColor Green
if ($ip) {
    Write-Host "  Dari LAN   : http://${ip}:$port  (perangkat di WiFi yang sama)" -ForegroundColor Green
}

# ---------- 5. Tunnel publik (Cloudflare, gratis, tanpa akun) ----------
if ($NoTunnel) {
    Write-Host "`nMode tanpa tunnel. Tekan Ctrl+C untuk berhenti." -ForegroundColor Yellow
    try { Wait-Process -Id $server.Id } finally {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
    exit 0
}

Judul "Link eksternal (tunnel publik)"
$toolsDir = "$root\tools"
$cf = "$toolsDir\cloudflared.exe"
if (-not (Test-Path $cf)) {
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    Write-Host "Mengunduh cloudflared.exe (sekali saja, sekitar 60 MB)..."
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $cf -UseBasicParsing
    Write-Host "cloudflared terunduh"
}

# Jalankan tunnel di latar, lalu ambil URL dari log-nya
Remove-Item $logTunnel -Force -ErrorAction SilentlyContinue
$tunnel = Start-Process $cf -ArgumentList "tunnel", "--url", "http://localhost:$port" `
    -PassThru -WindowStyle Hidden -RedirectStandardError $logTunnel
Write-Host "Membuka tunnel..." -ForegroundColor Yellow

$publik = $null
foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    if ($tunnel.HasExited) { break }
    $log = Get-Content $logTunnel -Raw -ErrorAction SilentlyContinue
    if ($log -match "https://[a-z0-9-]+\.trycloudflare\.com") {
        $publik = $Matches[0]; break
    }
}

if ($publik) {
    # Simpan agar tampil sebagai chip "link eksternal" di aplikasi web
    Set-Content -Path $urlFile -Value $publik -Encoding ASCII

    $lebar = $publik.Length + 6
    $garis = "+" + ("-" * $lebar) + "+"
    Write-Host ""
    Write-Host "  LINK EKSTERNAL (bagikan ke siapa saja):" -ForegroundColor Green
    Write-Host "  $garis" -ForegroundColor Green
    Write-Host ("  |   {0}   |" -f $publik) -ForegroundColor Green
    Write-Host "  $garis" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Link juga tampil di header aplikasi web (chip hijau, ada tombol salin)." -ForegroundColor Yellow
    Write-Host "  URL berganti setiap kali skrip dijalankan ulang." -ForegroundColor DarkGray
    Write-Host "  Tekan Ctrl+C untuk berhenti.`n" -ForegroundColor Yellow
} else {
    Write-Host "`nTunnel gagal dibuat. Log:" -ForegroundColor Red
    Get-Content $logTunnel -ErrorAction SilentlyContinue | Select-Object -Last 12 |
        ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "  Aplikasi tetap bisa diakses lokal: http://localhost:$port" -ForegroundColor Yellow
}

# Tunggu sampai dihentikan (Ctrl+C) lalu rapikan
try {
    Wait-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
} finally {
    Write-Host "`nMenghentikan server & tunnel..." -ForegroundColor Yellow
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
    Remove-Item $urlFile -Force -ErrorAction SilentlyContinue
    Write-Host "Selesai."
}

