GM CODEX 0.1.0 - PROTOTIPO PER FOUNDRY VTT V13
================================================

INSTALLAZIONE MANUALE
1. Chiudi il mondo di Foundry VTT.
2. Estrai la cartella "gm-codex" dentro:
   {User Data}/Data/modules/
3. Avvia Foundry e apri il tuo mondo.
4. Vai in Manage Modules e abilita "GM Codex".
5. Come GM, apri i controlli Token/Note sulla sinistra e premi l'icona a forma di libro "Apri GM Codex".

ALTERNATIVA DA CONSOLE/MACRO
Puoi aprire il Codex anche eseguendo:

game.modules.get("gm-codex").api.open();

COME FUNZIONA
- Ogni voce del Codex è un normale JournalEntry di Foundry.
- Il modulo usa flags namespaced "gm-codex" per classificare le schede.
- Le schede create dal modulo vengono raccolte nella cartella Journal "GM Codex".
- Se disabiliti il modulo, i Journal restano nel mondo.

SEZIONI DEL PROTOTIPO
- Città / Panoramica
- Fazioni
- PNG
- Missioni con stato
- Luoghi fuori città
- Incontri fuori città
- Ricerca globale
- Mostra ora ai giocatori
- Visibilità persistente al gruppo / Solo GM
- Dati demo opzionali

SCRITTURA E IMMAGINI
Premi "Modifica scheda": si apre il normale Journal di Foundry. Puoi usare l'editor, aggiungere immagini, collegamenti, pagine aggiuntive e tutte le funzioni native del Journal.

NOTA
Questa è una versione 0.1 pensata per verificare il flusso d'uso e l'interfaccia prima di aggiungere funzioni più complesse.


VERSIONE 0.2.0
- Aggiunto pulsante Elimina per città, fazioni, PNG, missioni, luoghi e incontri.
- Conferma prima dell'eliminazione.
- Eliminando una città vengono eliminate anche le schede Codex collegate alla città.
- Eliminando una fazione, i PNG collegati restano ma il collegamento alla fazione viene rimosso.
- Anteprima migliorata: tutte le pagine testuali e immagini del Journal sono visibili direttamente nel Codex.
- Corretto lo scorrimento verticale dei contenuti lunghi.
