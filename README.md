# rechnung.

**E-Rechnung ohne Abo.** rechnung. schreibt XRechnungen, rechnet sie nach und zeigt empfangene als lesbare Rechnung, offline und ohne Konto.

Wer als Freiberufler oder Kleinselbstständiger ein paar Rechnungen im Monat schreibt, zahlt für E-Rechnungen oft ein Buchhaltungsabo. Die kostenlosen Online-Generatoren verlangen, dass du Kunden- und Umsatzdaten auf fremde Server lädst, und offene Prüfer sind Java-Werkzeuge für Entwickler. rechnung. macht nur den Teil "E-Rechnung schreiben und lesen": ein Formular, eine XML-Datei, eine Vorprüfung. Reine Rechnung, keine KI, kein Server.

<p align="center">
  <img src="bilder/1-uebersicht.png" width="240" alt="">
</p>

<p align="center">
  <img src="bilder/2-breit.png" width="640" alt="">
</p>

## Warum

Seit 2025 müssen Unternehmen in Deutschland E-Rechnungen empfangen können, später auch ausstellen. Eine E-Rechnung ist XML, das man ohne Werkzeug nicht lesen und von Hand nicht sicher schreiben kann. rechnung. ersetzt kein Buchhaltungsprogramm wie sevDesk oder Lexware Office. Es ersetzt nur das, was du brauchst, wenn du ein paar Rechnungen im Monat schreibst oder eine empfangene prüfen willst.

Kleinunternehmer dürfen weiter Papier- oder PDF-Rechnungen schreiben. rechnung. behauptet keine Pflicht und sagt dir nicht, ob du Kleinunternehmer bist.

## Funktionen

- **Schreiben:** Formular für eine Rechnung, Ausgabe als XRechnung 3.0 in der Syntax CII (`.xml`, Dateiname aus der Rechnungsnummer)
- **Absenderprofil:** Firma, Anschrift, Steuernummer oder USt-IdNr., Kontakt, E-Mail, IBAN. Einmal anlegen, für jede Rechnung genutzt
- **Kunden:** kleine Liste mit Anschrift, E-Mail und Käuferreferenz (Leitweg-ID)
- **Positionen** mit Menge, Einheit (Stück, Stunde, Tag, Pauschale), Einzelpreis netto und Steuersatz 19, 7 oder 0 (Kleinunternehmer nach § 19 UStG)
- **Nachrechnen** live im Formular: Zeilensummen, Steuer je Satz, Netto, Brutto nach EN 16931
- **Rechnungsnummer** fortlaufend mit einstellbarem Präfix, von Hand überschreibbar
- **Lesen:** XRechnung oder ZUGFeRD-XML (CII) und XRechnung UBL per Datei öffnen oder hineinziehen. Anzeige als normale Rechnung, Summen werden nachgerechnet, Abweichungen markiert. Felder, die rechnung. nicht kennt, erscheinen als Rohliste statt zu verschwinden. Das rohe XML lässt sich aufklappen
- **Vorprüfung** ausgewählter Pflichtfeld- und Rechenregeln mit Regel-ID und deutschem Hinweis
- **Drucken** der lesbaren Ansicht über den Browser, auch als PDF
- **Export und Import** aller Daten als JSON-Datei
- Beispieldaten zum Ausprobieren, mit einem Klick entfernbar
- Hell und dunkel, funktioniert offline, installierbar als App

## Grenzen

Das gehört zur Ehrlichkeit dazu:

- **Die Prüfung ist eine Vorprüfung, keine amtliche Validierung.** rechnung. prüft eine Auswahl der Regeln (Pflichtfelder, Summen, Steuerkategorien, Zahlungsanweisung, Käuferreferenz, Steuernummer, elektronische Adressen), aber kein vollständiges Schematron. Eine Datei kann die Vorprüfung bestehen und trotzdem vom Empfänger abgelehnt werden. Für Verbindlichkeit nimm den KoSIT-Validator.
- **Die geschriebenen Dateien wurden bisher nicht durch den KoSIT-Validator geprüft.** Das ist als manueller Schritt vor einer Freigabe vorgesehen und noch offen.
- **Das Lesen ist nur mit eigenen Beispielen getestet.** Getestet sind zwei selbst geschriebene Dateien (CII mit Zuschlag, UBL mit Nachlass) und der Round-Trip der eigenen CII-Dateien. Offizielle Beispiele der KoSIT-Testsuite liegen noch nicht bei. Ob Dateien anderer Software richtig gelesen werden, ist deshalb **noch nicht getestet**.
- **Kein ZUGFeRD-PDF.** Es wird kein PDF/A-3 mit eingebettetem XML erzeugt und kein XML aus PDFs gelesen. Der Druck ist ein normales PDF.
- Beim Schreiben keine Nachlässe und Zuschläge, keine Gutschriften, keine Abschlagsrechnungen, keine Fremdwährung (nur EUR), kein Reverse Charge. Beim Lesen werden Nachlässe und Zuschläge auf Dokumentebene mitgerechnet.
- Keine Buchhaltung, keine Mahnungen, kein Versand, keine Peppol-Anbindung, keine Bankanbindung.
- Keine Steuerberatung.
- XRechnung bekommt regelmäßig neue Versionen. Die verwendete Kennung (3.0) steht an genau einer Stelle in `logik.js`.

## Datenschutz

Nichts verlässt dein Gerät. rechnung. hat keinen Server, kein Konto, keine Analyse, keine Werbung und lädt nichts aus dem Netz nach, auch keine Schriften. Profil, Kunden und Rechnungen liegen nur in der lokalen Datenbank deines Browsers (IndexedDB). Dateien, die du liest, werden im Browser verarbeitet. Der XML-Parser lehnt DOCTYPE und eigene Entities ab, damit eine fremde Datei nichts nachladen kann.

Weil die Daten nur im Browser liegen: Wer die Websitedaten löscht, löscht auch seine Rechnungen. Mach deshalb ab und zu einen Export als JSON.

## Installation

rechnung. ist eine statische Web-App. Es gibt keinen Build-Schritt und keine Abhängigkeiten.

1. Den Ordner `rechnung/` auf einen beliebigen statischen Host legen (eigener Webspace, GitHub Pages, Netlify, ein Raspberry Pi). Für die Installation als App ist HTTPS nötig.
2. Die Adresse im Browser öffnen.
3. Im Browsermenü **Zum Startbildschirm hinzufügen** oder **Installieren** wählen. Danach startet rechnung. wie eine App und funktioniert auch ohne Netz.

Lokal testen:

```
cd rechnung
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen.

Tests (Node ab Version 18, keine Pakete nötig):

```
node --test
```

## Wie gerechnet wird

Alle Funktionen stehen als reine Funktionen in `logik.js`. Gerechnet wird mit `BigInt` in festen Nachkommastellen, nie mit Gleitkommazahlen. Beträge, Mengen und Preise werden als Dezimal-Strings gespeichert.

**1. Zeile (BT-131).** Menge × Einzelpreis, kaufmännisch auf 2 Stellen gerundet (ab 5 weg von null). Der Einzelpreis selbst wird nicht gerundet.

**2. Steuer je Satz (BT-116, BT-117).** Basis = Summe der Zeilen mit diesem Satz (beim Lesen minus Nachlässe, plus Zuschläge dieses Satzes). Steuer = Basis × Satz ÷ 100, auf 2 Stellen gerundet.

**3. Summen.** Netto (BT-109) = Summe der Zeilen (BT-106) minus Nachlässe plus Zuschläge. Steuer gesamt (BT-110) = Summe der Steuerbeträge. Brutto (BT-112) = Netto + Steuer. Zahlbarer Betrag = Brutto minus Vorauszahlung (BT-115).

**4. Kleinunternehmer.** Bei 0 % schreibt rechnung. die Steuerkategorie E mit dem Befreiungsgrund `Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG`. Bei 19 und 7 % gilt Kategorie S.

**5. Format.** CII nach UN/CEFACT D16B, Typ 380, Währung EUR, Zahlungsart 58 (SEPA-Überweisung), Einheiten H87, HUR, DAY und LS.

**Testvektoren zum Nachrechnen** (alle in `test-calc.js`):

1. 10 × 85,00 (19 %) und 1 × 49,90 (7 %): Zeilen 850,00 und 49,90, Steuer 161,50 und 3,493 gerundet 3,49, Netto 899,90, Steuer 164,99, Brutto **1064,89**.
2. Kleinunternehmer, 3 × 33,33 (0 %): Zeile 99,99, Steuer 0,00, Brutto **99,99**.
3. Beim Lesen, 1,5 × 12,345 = 18,5175 gerundet 18,52 (19 %), Dokumentnachlass 2,00: Basis 16,52, Steuer 3,1388 gerundet 3,14, Brutto **19,66**.
4. Rundung an der Grenze: 1 × 0,125 wird 0,13, 1 × −0,125 wird −0,13.

**Geprüfte Regeln** (Vorprüfung, jeweils mit Regel-ID und deutschem Hinweis): BR-01 bis BR-11 und BR-16 (Kopf, Verkäufer, Käufer, Anschriften, mindestens eine Position), BR-CO-10, -13, -14, -15, -16 und -25 (Summen stimmen), BR-S-08 und -09, BR-E-08, -09 und -10 (Steuerbasis und Befreiungsgrund), BR-DE-1 bis -9 (Zahlungsanweisung, Verkäuferkontakt, Anschrift), BR-DE-15 (Käuferreferenz), BR-DE-16 (Steuernummer oder USt-IdNr.), BR-DE-19 (IBAN-Prüfsumme), BT-34 und BT-49 (elektronische Adressen).

Die Tests prüfen die Vektoren, Rundung, den XML-Parser (Entities, Namensräume, abgelehnter DOCTYPE), die Pflichtelemente und die Schema-Reihenfolge der geschriebenen Datei, den Round-Trip Schreiben und Lesen, das Lesen der Beispiele und den Export und Import.

## Lizenz

GNU Affero General Public License v3.0 (AGPL-3.0), siehe `LICENSE`.

---

**gedacht.gemacht.** Kleine, ehrliche Software. Alles bleibt auf deinem Gerät.
