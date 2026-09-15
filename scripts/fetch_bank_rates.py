"""Recupera un confronto delle offerte mutuo attualmente proposte dalle
principali banche italiane, dall'aggregatore telemutuo.it.

Perché un aggregatore e non il sito di ciascuna banca: i "fogli
informativi" ufficiali delle grandi banche sono PDF il cui nome file
cambia a ogni aggiornamento, e molte banche (Intesa Sanpaolo compresa)
non pubblicano nemmeno un link pubblico stabile al documento - richiede
accesso all'home banking. L'aggregatore mostra offerte reali e verificabili
per un profilo standard (vedi PROFILO_ESEMPIO), non è quindi una fonte
"ufficiale" quanto Euribor/IRS, ma è il miglior compromesso pubblico
disponibile ed è verificato contro un caso reale (vedi README).
"""

import re

import requests
from bs4 import BeautifulSoup

URL = "https://www.telemutuo.it/migliori-mutui-banca-intesa-sanpaolo.php"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MutuoTassiMonitor/1.0)"}

PROFILO_ESEMPIO = "Acquisto prima casa, finanziamento 100%, immobile 150.000€, durata 20 anni"

RATE_PATTERN = re.compile(r"Tasso:\s*([FV])\s*-\s*Taeg:\s*([\d.]+)%\s*-\s*Tan:\s*([\d.]+)%")
RATA_PATTERN = re.compile(r"Rata\s*€\s*([\d.,]+)\s*al mese x (\d+) anni")


def fetch_bank_rates():
    response = requests.get(URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    offers = []
    for block in soup.select(".timeline-content"):
        label = block.select_one("span.fs-6.text-gray-800.fw-bolder.d-block")
        detail = block.select_one("span.fw-bold.text-gray-500")
        if not label or not detail:
            continue

        label_text = label.get_text(strip=True)
        if " - " not in label_text:
            continue
        banca, prodotto = label_text.split(" - ", 1)

        detail_text = detail.get_text(" ", strip=True)
        rate_match = RATE_PATTERN.search(detail_text)
        if not rate_match:
            continue
        rata_match = RATA_PATTERN.search(detail_text)

        tipo_tasso, taeg, tan = rate_match.groups()

        offers.append({
            "banca": banca.strip(),
            "prodotto": prodotto.strip(),
            "tipo_tasso": "fisso" if tipo_tasso == "F" else "variabile",
            "tan": float(tan),
            "taeg": float(taeg),
            "rata_mensile": float(rata_match.group(1).replace(",", "")) if rata_match else None,
            "durata_anni": int(rata_match.group(2)) if rata_match else None,
            "surroga": "surroga" in prodotto.lower(),
        })

    if not offers:
        raise ValueError(
            "Nessuna offerta trovata: la struttura della pagina telemutuo.it "
            "potrebbe essere cambiata."
        )

    return offers


if __name__ == "__main__":
    for offer in fetch_bank_rates():
        print(offer)
