"""Invio di un messaggio Telegram tramite l'API dei bot."""

import requests


def send_telegram_message(token, chat_id, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    response = requests.post(
        url,
        json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        timeout=15,
    )
    if not response.ok:
        print(f"Errore invio Telegram: {response.status_code} {response.text}")
