# Kalorien-Scanner

PWA, die Kalorien und Makros aus einem Foto schätzt. Nutzt die Anthropic Vision API.

## Setup

1. **API-Key holen**: https://console.anthropic.com/settings/keys → "Create Key"
2. **App öffnen**: `index.html` im Browser (Chrome/Edge/Safari) öffnen
   - Empfohlen: über kleinen lokalen Webserver, z. B. `python -m http.server 8000` und dann http://localhost:8000
   - Direkt-Öffnen per `file://` funktioniert teilweise, Service Worker und Kamera-Capture brauchen aber http(s)
3. Beim ersten Start öffnet sich der Einstellungs-Dialog → Key einfügen, Modell wählen, Speichern

## Modelle

- **Haiku 4.5** (`claude-haiku-4-5`) — schnell, ca. **0,5 ct/Bild**. Default. Reicht für Alltag.
- **Sonnet 4.6** (`claude-sonnet-4-6`) — genauer bei komplexen Tellern, ca. **2 ct/Bild**.

## Nutzung

- 📷 Foto aufnehmen oder aus Galerie wählen
- Optional: Hinweis hinzufügen ("große Portion", "mit Sahne")
- 🔍 Analysieren → Ergebnis erscheint nach 2–5 Sekunden
- ✓ "Zu heute hinzufügen" → wird im Tages-Log gezählt

**Tipp für genauere Schätzung**: Hand, Münze oder Besteck mit aufs Bild — die KI nutzt das als Größenreferenz.

## Datenschutz

- API-Key wird nur im **localStorage des Browsers** gespeichert (lokal auf dem Gerät, nirgendwo sonst)
- Fotos werden bei jeder Analyse an Anthropic gesendet (Vision-API), aber nicht woanders gespeichert
- Tages-Log liegt lokal im Browser

## Als App installieren

- **iOS Safari**: Teilen-Button → "Zum Home-Bildschirm"
- **Android Chrome**: Menü → "App installieren"
- **Desktop Chrome/Edge**: Adressleiste → Install-Icon

## Genauigkeit

KI-Schätzungen aus Fotos liegen typischerweise **±20–30 %** daneben — Portionsgröße ist das Hauptproblem. Für grobe Orientierung gut, für strenges Diät-Tracking nur okay.
