# Monitor Tassi Mutuo

Monitoraggio automatico giornaliero di Euribor 6 mesi e IRS (Eurirs) 3 anni,
con storico pubblico e dashboard su GitHub Pages, e alert Telegram quando i
tassi cambiano in modo significativo.

## Come funziona

1. **Ogni giorno**, GitHub Actions esegue `scripts/update_and_check.py` sui
   server di GitHub (nessun PC deve restare acceso).
2. Lo script scarica i valori aggiornati di Euribor 6M e IRS 3A, li confronta
   con l'ultimo valore salvato e li aggiunge allo storico in `docs/data/*.json`.
3. Se la variazione rispetto al giorno precedente è ≥ 0,05 punti percentuali
   (soglia configurabile in `CHANGE_THRESHOLD` dentro `update_and_check.py`),
   invia un messaggio Telegram.
4. I file aggiornati vengono committati automaticamente nel repository.
5. GitHub Pages pubblica la cartella `docs/` come sito statico: la dashboard
   legge quei file JSON e mostra grafici e valori attuali.

## Perché i tuoi dati personali non sono nel repository

Il repository è pubblico (necessario per GitHub Pages gratuito). I dati di
mercato (Euribor, IRS) non sono sensibili e vengono pubblicati. I **tuoi**
dati del mutuo (importo, residuo, date, tasso) li inserisci nel form della
dashboard: restano salvati solo nel tuo browser (`localStorage`), non
vengono mai inviati a GitHub né a nessun altro servizio. Il calcolo della
rata, della proiezione del capitale e delle due nuove rate stimate avviene
interamente nel tuo browser, in JavaScript, usando gli ultimi dati di
mercato pubblicati.

## Fonti dati e loro limiti

| Serie | Fonte | Frequenza | Note |
|---|---|---|---|
| Euribor 6 mesi | [euribor-rates.eu](https://www.euribor-rates.eu/en/current-euribor-rates/3/euribor-rate-6-months/) | giornaliera | Riporta il fixing ufficiale EMMI |
| IRS 3 anni | [casaninja.it](https://casaninja.it/tassi/irs/3-anni) | giornaliera | Dato di mercato aggregato: **nessuna fonte istituzionale pubblica gratuitamente il fixing IRS in tempo reale** |
| Euribor 6M (media mensile) | [ECB Data Portal](https://data.ecb.europa.eu/) (BCE, via API SDMX ufficiale) | mensile | Riferimento istituzionale di verifica incrociata |

Se una di queste pagine cambia struttura, lo script corrispondente
(`scripts/fetch_euribor.py`, `scripts/fetch_irs.py`) fallirà con un errore
chiaro nei log dell'Action — è normale nel tempo, andrà solo aggiornato il
selettore HTML.

**Attenzione:** i valori di IRS ed Euribor usati nella simulazione della
tua rata futura sono gli **ultimi disponibili al momento in cui apri la
pagina**, non i valori reali che si applicheranno alla scadenza del tuo
tasso fisso (che dipendono dal mercato in quel momento). È una stima che si
affina automaticamente giorno dopo giorno, non una previsione certa.

## Struttura del progetto

```
.github/workflows/daily-check.yml   Il "robot" che gira ogni giorno
scripts/                            Script Python (raccolta dati + alert)
docs/                                Sito pubblicato su GitHub Pages
docs/data/*.json                    Storico dei tassi (aggiornato ogni giorno)
docs/index.html, style.css, app.js  Dashboard e calcolatore personale
```

## Configurazione (una tantum)

### 1. Attivare GitHub Pages
Su github.com, nel repository: **Settings → Pages → Build and deployment
→ Source: "Deploy from a branch"**, branch `main`, cartella `/docs`. Salva.
Dopo 1-2 minuti la dashboard sarà visibile all'URL indicato.

### 2. Creare il bot Telegram (per gli alert)
1. Apri Telegram, cerca **@BotFather** e avvia una chat.
2. Manda `/newbot`, scegli un nome e uno username (deve finire in "bot").
3. BotFather ti darà un **token** (una stringa tipo `123456:ABC-DEF...`).
4. Scrivi un messaggio qualsiasi al tuo nuovo bot (per attivare la chat).
5. Recupera il tuo **chat_id** visitando, nel browser:
   `https://api.telegram.org/bot<IL_TUO_TOKEN>/getUpdates`
   e cercando il campo `"chat":{"id": ... }` nella risposta.

### 3. Salvare token e chat_id come "secret" del repository
Su github.com: **Settings → Secrets and variables → Actions → New repository
secret**. Crea due secret:
- `TELEGRAM_BOT_TOKEN` con il token del bot
- `TELEGRAM_CHAT_ID` con il tuo chat_id

I secret sono cifrati: nessuno (nemmeno tu, dopo averli salvati) può
rileggerli dall'interfaccia — solo lo script durante l'esecuzione automatica
può usarli.

### 4. Primo avvio manuale (opzionale, per non aspettare il giorno dopo)
Su github.com, tab **Actions → Controllo giornaliero tassi mutuo → Run
workflow**. Popola subito i dati e la dashboard.

## Modificare la soglia di alert

In `scripts/update_and_check.py`, cambia il valore di `CHANGE_THRESHOLD`
(espresso in punti percentuali, es. `0.05` = 5 centesimi di punto).

## Disclaimer

Questo progetto non costituisce consulenza finanziaria. I valori mostrati
sono stime basate su fonti pubbliche e sulle formule contrattuali che hai
indicato: verifica sempre i valori ufficiali con la tua banca prima di
prendere decisioni sul tuo mutuo.
