# Scheduler eksternal lokal (Windows Task Scheduler, tiap jam menit ke-7): memanggil /api/tick.
# Secret dibaca dari .env (tidak dikomit). Hasil tiap panggilan ditambahkan ke scheduler/riwayat_panggilan.csv.
$root = Split-Path -Parent $PSScriptRoot
$envs = @{}
Get-Content (Join-Path $root '.env') | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)=(.*)$') { $envs[$matches[1]] = $matches[2].Trim() } }
$t = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
$out = Join-Path $PSScriptRoot 'riwayat_panggilan.csv'
if (-not (Test-Path $out)) { 'waktu_lokal,http,hasil' | Out-File -FilePath $out -Encoding utf8 }
for ($a = 1; $a -le 3; $a++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method POST -TimeoutSec 90 -Uri ($envs['BOT_URL'] + '/api/tick') -Headers @{ Authorization = 'Bearer ' + $envs['CRON_SECRET'] }
    "$t,$($r.StatusCode),""$($r.Content -replace '""','''')""" | Out-File -FilePath $out -Append -Encoding utf8
    break
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    "$t,$code,""percobaan $a gagal: $($_.Exception.Message -replace '""','''')""" | Out-File -FilePath $out -Append -Encoding utf8
    Start-Sleep -Seconds (20 * $a)
  }
}
