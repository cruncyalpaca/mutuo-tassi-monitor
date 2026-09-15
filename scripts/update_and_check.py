"""Script principale eseguito ogni giorno da GitHub Actions.

Cosa fa, in ordine:
1. Scarica i valori aggiornati di Euribor 6M, IRS 3A e la media mensile BCE.
2. Li confronta con l'ultimo valore già salvato nello storico.
3. Aggiorna i file JSON in docs/data/ (quelli letti dalla dashboard pubblica).
4. Se il cambiamento rispetto al giorno precedente supera la soglia definita,
   invia un messaggio Telegram (se le credenziali sono configurate).
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fetch_ecb_monthly import fetch_ecb_euribor_6m_monthly
from fetch_euribor import fetch_euribor_6m
from fetch_irs import fetch_irs_3y
from telegram_notify import send_telegram_message

DATA_DIR = Path(__file__).parent.parent / "docs" / "data"

# Soglia di variazione (in punti percentuali) considerata "significativa".
# 0.05 = 5 centesimi di punto, cioè 5 basis point.
CHANGE_THRESHOLD = 0.05


def load_history(filename):
    path = DATA_DIR / filename
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_history(filename, history):
    path = DATA_DIR / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
        f.write("\n")


def merge_points(history, new_points):
    """Unisce i nuovi punti allo storico, senza duplicati, ordinato per data."""
    by_date = {p["date"]: p["value"] for p in history}
    for p in new_points:
        by_date[p["date"]] = p["value"]
    return [{"date": d, "value": v} for d, v in sorted(by_date.items())]


def process_series(label, filename, fetch_fn, alerts):
    history = load_history(filename)
    previous_latest = history[-1] if history else None

    try:
        new_points = fetch_fn()
    except Exception as exc:
        print(f"[{label}] ERRORE nel recupero dati: {exc}")
        return

    if not new_points:
        print(f"[{label}] Nessun dato recuperato.")
        return

    merged = merge_points(history, new_points)
    new_latest = merged[-1]
    save_history(filename, merged)
    print(f"[{label}] Ultimo valore: {new_latest['date']} = {new_latest['value']}%")

    if previous_latest and new_latest["date"] != previous_latest["date"]:
        delta = round(new_latest["value"] - previous_latest["value"], 3)
        if abs(delta) >= CHANGE_THRESHOLD:
            segno = "+" if delta > 0 else ""
            alerts.append(
                f"{label}: {previous_latest['value']:.3f}% -> {new_latest['value']:.3f}% "
                f"({segno}{delta:.3f} p.p.) il {new_latest['date']}"
            )


def process_ecb_reference():
    try:
        new_points = fetch_ecb_euribor_6m_monthly()
    except Exception as exc:
        print(f"[BCE - media mensile] ERRORE: {exc}")
        return

    if not new_points:
        print("[BCE - media mensile] Nessun dato recuperato.")
        return

    history = load_history("euribor_6m_ecb_monthly.json")
    merged = merge_points(history, new_points)
    save_history("euribor_6m_ecb_monthly.json", merged)
    print(f"[BCE - media mensile] Ultimo valore: {merged[-1]['date']} = {merged[-1]['value']}%")


def main():
    if os.environ.get("TEST_TELEGRAM", "").lower() == "true":
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        if not token or not chat_id:
            print("Test Telegram richiesto ma i secret TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID non sono configurati.")
            return
        ok = send_telegram_message(
            token,
            chat_id,
            "Messaggio di test da Monitor Tassi Mutuo: la configurazione funziona correttamente.",
        )
        print("Messaggio di test inviato su Telegram." if ok else "Invio del messaggio di test FALLITO (vedi errore sopra).")
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    alerts = []
    process_series("Euribor 6 mesi", "euribor_6m.json", fetch_euribor_6m, alerts)
    process_series("IRS 3 anni", "irs_3y.json", fetch_irs_3y, alerts)
    process_ecb_reference()

    if alerts:
        message = "Cambiamento significativo nei tassi mutuo:\n\n" + "\n".join(alerts)
        print(message)

        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        if token and chat_id:
            send_telegram_message(token, chat_id, message)
        else:
            print("Telegram non configurato (secrets assenti): nessun messaggio inviato.")
    else:
        print("Nessun cambiamento significativo rilevato oggi.")


if __name__ == "__main__":
    main()
