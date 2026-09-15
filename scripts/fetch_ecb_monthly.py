"""Recupera la media mensile ufficiale dell'Euribor 6 mesi dalla Banca
Centrale Europea (ECB Data Portal, API SDMX pubblica).

Questa serie e' il riferimento "istituzionale" richiesto: la BCE (di cui
Banca d'Italia e' membro del Sistema Europeo di Banche Centrali) pubblica
gratuitamente questi dati via API ufficiale. E' una media mensile, quindi
non sostituisce il fixing giornaliero (fetch_euribor.py), ma serve come
verifica incrociata "ufficiale" nel tempo.
"""

import csv
import io

import requests

URL = (
    "https://data-api.ecb.europa.eu/service/data/FM/"
    "M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA"
    "?format=csvdata&lastNObservations=6"
)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MutuoTassiMonitor/1.0)"}


def fetch_ecb_euribor_6m_monthly():
    response = requests.get(URL, headers=HEADERS, timeout=30)
    response.raise_for_status()

    reader = csv.DictReader(io.StringIO(response.text))
    points = []
    for row in reader:
        period = row.get("TIME_PERIOD", "")
        try:
            value = float(row["OBS_VALUE"])
        except (KeyError, ValueError, TypeError):
            continue
        if len(period) != 7:
            continue
        points.append({"date": f"{period}-01", "value": round(value, 3)})

    return points


if __name__ == "__main__":
    for point in fetch_ecb_euribor_6m_monthly():
        print(point)
