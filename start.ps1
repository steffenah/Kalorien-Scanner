# Startet einen lokalen Webserver und öffnet die App im Browser.
# Service Worker und Kamera-Capture brauchen http(s), funktionieren nicht über file://

$port = 8000
$root = $PSScriptRoot

Write-Host "Starte Kalorien-Scanner auf http://localhost:$port ..." -ForegroundColor Green

# Python-Webserver (kommt mit Windows oft mit). Falls Python fehlt: aus dem Microsoft Store installieren.
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }

if (-not $py) {
  Write-Host "Python nicht gefunden. Installiere Python aus dem Microsoft Store und versuche es erneut." -ForegroundColor Red
  Write-Host "Alternative: index.html direkt im Browser per Doppelklick öffnen (eingeschränkt)." -ForegroundColor Yellow
  Read-Host "Enter zum Schließen"
  exit 1
}

Start-Process "http://localhost:$port/"
Set-Location $root
& $py.Source -m http.server $port
