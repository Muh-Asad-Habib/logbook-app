# Hentikan paksa server & tunnel yang masih berjalan di latar belakang.
Get-Process node, cloudflared -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and ($_.Path -like "*logbook-app*" -or $_.ProcessName -eq "cloudflared") } |
    Stop-Process -Force -ErrorAction SilentlyContinue

# Fallback: hentikan node yang memakai port 4000
$conn = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "Semua proses logbook dihentikan."

