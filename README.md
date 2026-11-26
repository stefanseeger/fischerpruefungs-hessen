# Probeklausur Fischerprüfung Hessen

Interaktive Lern- und Prüfungsvorbereitung für die staatliche Fischerprüfung in Hessen auf Basis des offiziellen Fragenkatalogs (Stand 2025).

**Live-Website (GitHub Pages):**
👉 https://stefanseeger.github.io/fischerpruefungs-hessen/

## Funktionen

- **Probeklausur nach Prüfungsordnung (HFischV):**
  - 60 zufällig ausgewählte Fragen (12 Fragen je Sachgebiet aus allen 5 Sachgebieten)
  - 120 Minuten Countdown-Timer mit automatischer Abgabe
  - Offizielle Auswertung: mindestens 45/60 gesamt und mindestens 9/12 in jedem einzelnen Sachgebiet
  - Detailauswertung mit Erklärtexten zu falsch beantworteten Fragen
- **Zufällige Fragen üben:**
  - Auswahl der gewünschten Sachgebiete (standardmäßig alle ausgewählt) sowie zwischen *Nur offene Fragen*, *Nur falsch beantwortete* oder *Alle Fragen*
  - Direkte Auswertung mit Erklärung bei Falschantworten
- **Durchsuchbarer Fragenkatalog:**
  - Suche nach Stichworten, Antworten oder Katalognummern
  - Filter nach Sachgebiet sowie Antwortstatus (*Richtig*, *Falsch*, *Noch unbeantwortet*)
- **Responsive Design:** Optimiert für Desktop und Mobilgeräte

## Quelle des Fragenkatalogs

- Übersicht Fischerei (Landesportal Hessen): https://landwirtschaft.hessen.de/wasser/fischerei
- Verwendeter Fragenkatalog (2025): [fischerpruefungsfragen_und-antworten_hessen_mit_loesungen.pdf](https://landwirtschaft.hessen.de/sites/landwirtschaft.hessen.de/files/2025-06/fischerpruefungsfragen_und-antworten_hessen_mit_loesungen.pdf)

## Lokal starten

```bash
python server.py
```

Danach im Browser `http://127.0.0.1:8765` öffnen.
