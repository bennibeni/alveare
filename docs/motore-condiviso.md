# Motore condiviso e versionato

La fonte del motore è `../alveare-motore/src/`. L’app usa il pacchetto `@alveare/motore`, installato da un archivio locale in `vendor/`. I file principali in `game/` sono adattatori; non contengono copie dell’algoritmo.

## Versione in uso

```powershell
npm run motore:versione
```

## Sperimentare e adottare

Modifica il sorgente in alveare-motore, aggiorna il changelog e crea una nuova versione:

```powershell
cd "../alveare-motore"
npm run release -- 1.1.0-beta.1
```

Dalla cartella dello Studio installala e verifica:

```powershell
npm run motore:aggiorna -- "../alveare-motore/releases/alveare-motore-1.1.0-beta.1.tgz"
npm test
npm run build
```

Alveare continua a usare la propria versione finché non esegui lì il comando di aggiornamento. Il passaggio non pubblica il sito e non modifica automaticamente l’altra app. Confronta prima molte partite appaiate e semi nuovi: i test non dimostrano da soli che l’algoritmo giochi meglio.

## Tornare a una versione precedente

```powershell
npm run motore:aggiorna -- vendor/alveare-motore-1.0.0.tgz
```

Ogni app conserva il pacchetto e il lockfile: `npm ci` reinstalla quella versione senza bisogno delle cartelle sorelle. Non modificare `node_modules` o gli adattatori per cambiare la strategia.

## Ricerca storica e nuove varianti

Gli esperimenti autonomi esistenti in `.strategy-lab/` restano invariati. Gli script di generazione delle varianti ora leggono il sorgente del pacchetto installato. Per una copia sperimentale manuale usa `engineDirectory()` da `@alveare/motore/node`, non copiare gli adattatori `game/`. Gli strumenti che calcolano l’identificativo della strategia includono l’impronta del pacchetto, così le valutazioni di versioni diverse non vengono confuse.
