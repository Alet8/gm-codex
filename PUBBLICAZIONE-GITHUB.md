# GM Codex — pubblicazione per installazione automatica in Foundry VTT

Questo repository è già predisposto per creare automaticamente una release Foundry completa.

## Prima pubblicazione

1. Su GitHub crea un repository **pubblico** chiamato `gm-codex`.
2. Carica nella radice del repository tutto il contenuto di questo pacchetto, inclusa la cartella nascosta `.github`.
3. Apri la scheda **Actions** del repository.
4. Se GitHub chiede di abilitare le Actions, abilitalo.
5. Apri il workflow **Publish Foundry Module**.
6. Premi **Run workflow**.
7. Lascia la versione `0.2.0` e conferma.

Il workflow crea automaticamente una GitHub Release con:

- `module.json`
- `gm-codex.zip`

Gli URL interni vengono costruiti automaticamente dal nome del tuo account GitHub, quindi non devi modificare il manifest a mano.

## Installazione in Foundry

Dopo che la release è stata creata, usa come Manifest URL:

`https://github.com/NOME-ACCOUNT/gm-codex/releases/latest/download/module.json`

Sostituisci solamente `NOME-ACCOUNT` con il tuo nome utente GitHub.

In Foundry VTT:

**Setup → Add-on Modules → Install Module → Manifest URL**

incolla l'indirizzo e premi **Install**.

## Aggiornamenti futuri

Quando viene preparata una nuova versione del modulo:

1. sostituisci/aggiorna nel repository i file del modulo;
2. vai in **Actions → Publish Foundry Module → Run workflow**;
3. inserisci la nuova versione, ad esempio `0.3.0`.

Il workflow crea la nuova release. Il Manifest URL rimane sempre lo stesso (`releases/latest/download/module.json`) e Foundry potrà rilevare il nuovo numero di versione durante il controllo aggiornamenti.
