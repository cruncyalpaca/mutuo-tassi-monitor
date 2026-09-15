"""Recupera il valore corrente dell'IRS (Eurirs) a 3 anni da casaninja.it.

L'IRS e' un dato di mercato (swap curve) che non viene distribuito
gratuitamente in tempo reale da alcuna fonte istituzionale (Banca d'Italia
o BCE pubblicano solo tassi di riferimento diversi, non la curva IRS).
Usiamo quindi un aggregatore pubblico che riporta il valore aggiornato
quotidianamente in un formato semplice da leggere (meta-description della
pagina). Se in futuro la pagina cambia struttura, questo script andra'
aggiornato: il log dell'errore lo segnala chiaramente.
"""

import re

import requests

URL = "https://casaninja.it/tassi/irs/3-anni"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MutuoTassiMonitor/1.0)"}

MESI_IT = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4,
    "maggio": 5, "giugno": 6, "luglio": 7, "agosto": 8,
    "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}

PATTERN = re.compile(
    r"IRS 3 anni:\s*([\d,]+)%\s*oggi\s*\((\d{1,2})\s+(\w+)\s+(\d{4})\)",
    re.IGNORECASE,
)


def fetch_irs_3y():
    response = requests.get(URL, headers=HEADERS, timeout=30)
    response.raise_for_status()

    match = PATTERN.search(response.text)
    if not match:
        raise ValueError(
            "Valore IRS 3 anni non trovato: la struttura della pagina "
            "casaninja.it potrebbe essere cambiata."
        )

    value_str, day, month_name, year = match.groups()
    month = MESI_IT.get(month_name.lower())
    if month is None:
        raise ValueError(f"Mese non riconosciuto nella pagina IRS: {month_name}")

    value = float(value_str.replace(",", "."))
    date_iso = f"{year}-{month:02d}-{int(day):02d}"
    return [{"date": date_iso, "value": round(value, 3)}]


if __name__ == "__main__":
    for point in fetch_irs_3y():
        print(point)
