# RECA – Turni di Casa (PWA)

App PWA per gestire i turni settimanali di una casa in comune: bucato, cucina (apparecchiare/sparecchiare), bagni e sala, con notifiche push mirate.

## Funzionalità
- **Installabile** come app nativa (iOS "Aggiungi a schermata Home" / Android)
- **Riconoscimento automatico**: inserisci il tuo nome → l'app associa camera e turni
- **Scanner QR** per collegare la stanza (fotocamera)
- **Orologio in tempo reale** con promemoria puntuali (feriali e weekend)
- **Finestra di 30 minuti**: ogni promemoria scompare dopo 30 minuti
- **Pagine dedicate**: Oggi, Bucato, Cucina, Bagno Ragazzi, Bagno Femminile, Bagno Giù, Sala
- **Area Admin** (protetta) per modificare turni, stanze e persone
- **Siri Glow**: bordo LED RGB animato con interruttore on/off
- **Offline**: service worker con cache

## Tecnologie
HTML + CSS + JavaScript puro (nessun build), Service Worker, Web Notifications API, jsQR (scansione QR), qrcode-generator (generazione QR).

## Struttura
```
index.html          → pagina principale (meta tag PWA)
manifest.json       → manifest PWA
service-worker.js   → cache e offline
style.css           → tema
app.js              → logica dell'app
jsqr.min.js         → libreria scansione QR
qrcodegen.js        → libreria generazione QR
icons/              → icone PWA
```

## Uso
Apri il sito, inserisci il **Codice Segreto della Casa** (predefinito: `RECA2026`, modificabile in Area Admin), crea il tuo account con email + nome vero e usa l'app.