"""Recupera lo storico giornaliero dell'Euribor 6 mesi da euribor-rates.eu.

Fonte scelta: la pagina pubblica euribor-rates.eu riporta il fixing ufficiale
EMMI aggiornato ogni giorno lavorativo, con una tabella "By day" degli ultimi
valori. Non esiste una fonte istituzionale (BCE/Banca d'Italia) che pubblichi
il fixing giornaliero gratuitamente in tempo reale: gli enti ufficiali
pubblicano solo medie mensili (vedi fetch_ecb_monthly.py), utili come
riferimento storico ma non per la rilevazione quotidiana richiesta qui.
"""

from datetime import datetime

import requests
from bs4 import BeautifulSoup

URL = "https://www.euribor-rates.eu/en/current-euribor-rates/3/euribor-rate-6-months/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MutuoTassiMonitor/1.0)"}


def fetch_euribor_6m():
    response = requests.get(URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    table = soup.select_one(".card-body table")
    if table is None:
        raise ValueError(
            "Tabella Euribor 6M non trovata: la struttura della pagina "
            "euribor-rates.eu potrebbe essere cambiata."
        )

    points = []
    for row in table.select("tbody tr"):
        cells = row.select("td")
        if len(cells) != 2:
            continue
        date_str = cells[0].get_text(strip=True)
        value_str = cells[1].get_text(strip=True).replace("%", "").replace(",", ".").strip()
        try:
            parsed_date = datetime.strptime(date_str, "%m/%d/%Y").date()
            value = float(value_str)
        except ValueError:
            continue
        points.append({"date": parsed_date.isoformat(), "value": round(value, 3)})

    if not points:
        raise ValueError("Nessun dato Euribor 6M estratto dalla pagina.")

    return points


if __name__ == "__main__":
    for point in fetch_euribor_6m():
        print(point)
