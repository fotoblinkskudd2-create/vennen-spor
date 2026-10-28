# Vennen Spør – minste prototype

Kamerafri radarboks + lokal stemme som **spør før den varsler**, og en familie-app som viser «Alt er bra».

Én fil: `index.html` (vanilla HTML/JS/CSS, ingen build). Åpne den i nettleseren, eller host gratis (GitHub Pages).

## Flyt
1. Radar «oppdager» mulig fall eller glemt pille (knapper til venstre).
2. Stemmen spør: «Gikk det bra?» / «Har du tatt medisinen?» (speechSynthesis nb-NO, ellers første stemme).
3. Svar med **Ja / Nei** eller 🎤 (SpeechRecognition hvis nettleseren støtter det).
   - **Ja** → logg OK, familie-status grønn «Alt er bra».
   - **Nei** → «Skal jeg ringe familien?» → Ja = rød ALARM, Nei = gul varsel.
   - **Ingen svar** (15 s, eller 5 s med «Kort timer») → «Jeg hører deg ikke, svar hvis du kan» → fortsatt ingen svar = rød ALARM.
4. Familie-app: statuskort (grønn/gul/rød), Pratet / Medisin / Bevegelse, varselfeed. 🔔 slår på nettleservarsler.

Logg og status lagres i `localStorage`. «Nullstill» tømmer alt. `?timeout=1` setter svartid til 1 s (for test).

## Test
```
npm i playwright-core
PW=playwright-core node test.js   # bruker /usr/bin/google-chrome
```
Dekker: Ja, Nei→ring, Nei→ikke ring, ingen svar→alarm, ingen svar→Ja på nytt forsøk, lagring etter reload, nullstill.

## Begrensninger
Simulering: ingen ekte radar, ingen ekte samtale/SMS til familie, familie-app er samme side. Stemmekvalitet avhenger av nettleserens norske stemme. Talegjenkjenning i Chrome går via Googles server (ikke lokalt) – ekte boks må bruke lokal modell (f.eks. Whisper/Vosk).
