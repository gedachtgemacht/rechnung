# rechnung.

E-Rechnungen als XRechnung schreiben, nachrechnen und lesbar ansehen, offline und ohne Konto.

## Problem

Seit 2025 müssen Unternehmen in Deutschland E-Rechnungen empfangen können, ab 2027 bzw. 2028 auch ausstellen. Eine E-Rechnung ist XML (XRechnung, ZUGFeRD), das man ohne Werkzeug nicht lesen und von Hand nicht sicher schreiben kann. Kleinselbstständige zahlen deshalb ein Abo bei sevDesk oder Lexware Office, obwohl sie nur ein paar Rechnungen im Monat schreiben. Die kostenlosen Online-Generatoren verlangen, dass man Kunden- und Umsatzdaten auf fremde Server lädt. Offene Prüfer (KoSIT-Validator, Mustang) sind Java-Werkzeuge für Entwickler.

## Zielgruppe

Freiberufler, Kleinselbstständige und Kleinunternehmer mit wenigen Rechnungen im Monat, die eine gültige XRechnung schreiben oder eine empfangene lesen wollen, ohne Buchhaltungssoftware und ohne Daten hochzuladen.

## Vorbild und Abgrenzung

- **sevDesk** und **Lexware Office**: Buchhaltung im Abo, grob im Bereich von etwa 8 bis 20 € im Monat je nach Tarif (Stand ungeprüft). Können E-Rechnungen schreiben, empfangen, verbuchen, dazu Belege, Bank, Steuer. Brauchen Konto, Daten liegen beim Anbieter.
- **Quba-Viewer** (offen): gute Desktop-Ansicht, Prüfung über einen Server. **BeInX**, **XPFeRD**: offene Ersteller, aber Demo-Charakter bzw. Docker.

rechnung. ersetzt nur den Teil "E-Rechnung schreiben und lesen". Keine Buchhaltung. Läuft im Browser als PWA, ohne Installation, ohne Konto, ohne Request nach außen.

## Funktionen v1

1. **Schreiben:** Formular für eine Rechnung, Ausgabe als XRechnung 3.0 in der Syntax CII (`.xml`-Download).
2. **Absenderprofil:** eigene Firma, Anschrift, Steuernummer bzw. USt-IdNr., Kontakt, E-Mail, IBAN. Einmal anlegen, für jede Rechnung genutzt.
3. **Kunden:** kleine Liste mit Name, Anschrift, E-Mail, Leitweg-ID bzw. Käuferreferenz.
4. **Positionen:** Bezeichnung, Menge, Einheit (Auswahl: Stück, Stunde, Tag, Pauschale), Einzelpreis netto, Steuersatz 19, 7 oder 0 (Kleinunternehmer nach § 19 UStG).
5. **Nachrechnen:** Zeilensummen, Steuer je Satz, Gesamtsummen nach EN 16931, live im Formular.
6. **Rechnungsnummer:** fortlaufend mit einstellbarem Präfix, manuell überschreibbar.
7. **Lesen:** XRechnung oder ZUGFeRD-XML (CII) und XRechnung UBL per Datei öffnen, als lesbare Rechnung anzeigen, Summen nachrechnen und Abweichungen markieren.
8. **Prüfen:** ausgewählte Pflichtfeld- und Rechenregeln (Liste unten) mit Regel-ID und deutschem Hinweis. Klar beschriftet als Vorprüfung, nicht als amtliche Validierung.
9. **Drucken:** lesbare Ansicht über den Browser drucken bzw. als PDF sichern (normales PDF, keine ZUGFeRD-Datei).
10. **Export und Import** aller Daten als JSON-Datei.

## Nicht-Ziele

- Kein ZUGFeRD-PDF (PDF/A-3 mit eingebettetem XML) erzeugen, kein XML aus PDFs extrahieren. Kommt vielleicht später.
- Keine vollständige Schematron-Validierung. Für Verbindlichkeit verweist die App auf den KoSIT-Validator.
- Keine Buchhaltung, keine Mahnungen, kein Versand, keine Peppol-Anbindung, keine Bankanbindung.
- Keine Nachlässe und Zuschläge auf Positionsebene beim Schreiben, keine Gutschriften, keine Abschlagsrechnungen, keine Fremdwährung (nur EUR), kein Reverse Charge.
- Keine Steuerberatung. Die App sagt nicht, ob jemand Kleinunternehmer ist.

## Daten und Format

Speicher: **IndexedDB**, ein Store pro Typ.

- `profil`: `{ name, strasse, plz, ort, land:"DE", steuernummer?, ustid?, kontaktName, telefon, email, iban, bic?, kleinunternehmer:bool }`
- `kunden[]`: `{ id, name, strasse, plz, ort, land, email, kaeuferreferenz }`
- `rechnungen[]`: `{ id, nummer, datum, faellig, leistungVon?, leistungBis?, kundeId, positionen:[{ text, menge, einheit, preis, satz }], hinweis?, status:"entwurf"|"erstellt", beispiel?:true }`
- `einstellungen`: `{ praefix, naechsteNummer }`

Beträge, Mengen und Preise werden als **Dezimal-Strings** gespeichert (`"12.345"`), nie als Float.

Export: `rechnung-export-JJJJ-MM-TT.json` mit `{ format:"rechnung.", version:1, profil, kunden, rechnungen, einstellungen }`. Import prüft `format` und `version` und fragt vor dem Überschreiben.

XML-Ausgabe: CII nach UN/CEFACT D16B, `GuidelineSpecifiedDocumentContextParameter` = `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`, Typ 380, Währung EUR, Zahlungsart 58 (SEPA-Überweisung), Einheiten H87 (Stück), HUR (Stunde), DAY (Tag), LS (Pauschale). Steuerkategorie S bei 19 und 7, E bei 0 mit Befreiungsgrund `Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG`. Dateiname `<nummer>.xml`.

Lesen: eigener kleiner XML-Parser als reine Funktion (Elemente, Attribute, Text, Namensräume, die fünf Standard-Entities und numerische Zeichenreferenzen; DOCTYPE wird abgelehnt). So läuft er auch in Node-Tests und ist gegen XXE sicher. Aus CII und UBL wird dasselbe interne Rechnungsobjekt erzeugt.

## Rechenlogik

Alle Funktionen rein, in `logik.js`, Rechnung mit `BigInt` in festen Nachkommastellen. Runden kaufmännisch (ab 5 weg von null) auf 2 Stellen.

- `zeile(menge, preis)` = runde2(menge × preis) (BT-131)
- `summeZeilen` = Σ Zeilen (BT-106)
- je Steuersatz: `basis` = Σ Zeilen des Satzes − Nachlässe + Zuschläge dieses Satzes (BT-116), `steuer` = runde2(basis × satz / 100) (BT-117)
- `netto` = BT-106 − Nachlässe (BT-107) + Zuschläge (BT-108) (BT-109)
- `steuerGesamt` = Σ BT-117 (BT-110), `brutto` = BT-109 + BT-110 (BT-112), `zahlbar` = BT-112 − Vorauszahlung (BT-115)

Nachlässe und Zuschläge auf Dokumentebene werden beim **Lesen** mitgerechnet, beim Schreiben nicht angeboten.

**Testvektoren:**

1. Positionen 10 × 85.00 (19 %) und 1 × 49.90 (7 %). Zeilen 850.00 und 49.90. Steuer 161.50 und 3.493 → 3.49. Netto 899.90, Steuer 164.99, brutto **1064.89**.
2. Kleinunternehmer: 3 × 33.33 (0 %, Kategorie E). Zeile 99.99, Steuer 0.00, brutto **99.99**, Befreiungsgrund gesetzt.
3. Rundung und Nachlass (nur Lesen): 1.5 × 12.345 = 18.5175 → 18.52 (19 %), Dokumentnachlass 2.00 (19 %). Basis 16.52, Steuer 3.1388 → 3.14, brutto **19.66**.
4. Rundung an der Grenze: 1 × 0.125 → 0.13, 1 × −0.125 → −0.13.

**Prüfregeln v1** (Auswahl, je mit ID): BR-01 bis BR-08 (Kopf, Verkäufer, Käufer, Anschriften), BR-16 (mindestens eine Position), BR-CO-10, -13, -14, -15 (Summen stimmen), BR-S-08 und BR-E-08 (Basis je Kategorie), BR-E-10 (Befreiungsgrund), BR-DE-1 (Zahlungsanweisung), BR-DE-2 (Verkäuferkontakt), BR-DE-15 (Käuferreferenz), BR-DE-16 (Steuernummer oder USt-IdNr.), BT-34 und BT-49 (elektronische Adressen). Die genaue Liste mit Wortlaut steht später in `README.md`.

Round-Trip-Test: die Rechnung aus Vektor 1 und 2 schreiben, mit dem eigenen Parser lesen, gleiche Summen und Felder. Mindestens ein offizielles KoSIT-Beispiel (CII und UBL, Apache-2.0, als Datei im Repo unter `test/beispiele/` mit Quellenangabe) wird gelesen, die Summen stimmen mit den Werten in der Datei überein.

**Stand, offen benannt:** Das offizielle KoSIT-Beispiel liegt noch nicht bei. In der Bauumgebung war kein Download möglich, und eine nachgetippte Datei wäre kein offizielles Beispiel. Getestet ist das Lesen bisher nur mit zwei selbst geschriebenen Beispielen (`test/beispiele/cii-zuschlag.xml`, `test/beispiele/ubl-nachlass.xml`) und dem Round-Trip der eigenen CII-Dateien. Ob echte Dateien anderer Software (KoSIT-Testsuite, Apache-2.0) richtig gelesen werden, ist **noch nicht getestet**. Das README muss diese Lücke nennen, bis die Dateien mit Quellenangabe ergänzt sind und `test-calc.js` sie liest.

## Demoseite

`index.html`, Handy zuerst, Navigation unten mit vier Reitern:

1. **rechnungen.** Liste der Rechnungen (Nummer, Kunde, Datum, Brutto in `--mono`), Knopf "neu", Knopf "Beispiel laden" bzw. "Beispiel entfernen".
2. **schreiben.** Formular: Kunde wählen oder anlegen, Datum, Fälligkeit, Leistungszeitraum, Positionen untereinander als Karten (ab 960 px zweizeilig: Bezeichnung über die volle Breite, darunter Menge, Einheit, Preis, USt und Betrag in einer Reihe, damit die Bezeichnung neben dem Summenblock bedienbar bleibt), Summenblock live, Prüfliste darunter (grün, gelb, rot mit Regel-ID), Knöpfe "XML laden" und "drucken".
3. **lesen.** Datei wählen oder hineinziehen. Anzeige als normale Rechnung (Absender, Empfänger, Positionen, Summen, Zahlungsdaten), daneben bzw. darunter die Prüfliste und der Hinweis, ob die Summen nachgerechnet stimmen. Rohes XML aufklappbar.
4. **profil.** Absenderdaten, Kleinunternehmer-Schalter, Nummernkreis, Export, Import, alles löschen.

Beispieldaten: erfundene Firma "Muster Grafik", erfundener Kunde, drei Rechnungen aus den Testvektoren, als `Beispiel` markiert. Hausstil über `hausstil.py`, hell und dunkel, PWA mit `manifest.webmanifest`, `sw.js`, `icon.svg` (Blatt mit Ecke und zwei Linien, Linienzeichnung).

## Testplan

- `node --test`: Rechenlogik gegen alle Testvektoren, Rundung, XML-Parser (Entities, Namensräume, DOCTYPE abgelehnt), CII-Schreiben (Pflichtelemente vorhanden, Reihenfolge nach Schema), Round-Trip, KoSIT-Beispiele lesen (noch offen, siehe oben), jede Prüfregel mit einem positiven und negativen Fall.
- Manuell einmalig vor der Freigabe: erzeugte Dateien aus Vektor 1 und 2 im KoSIT-Validator prüfen, Ergebnis im README vermerken.
- Browsertest bei 390 und 1280 px: Rechnung anlegen, XML laden, wieder öffnen, drucken.
- Offline-Test: nach erstem Laden Netz aus, App startet und funktioniert.
- Keine externen Requests: Netzwerkprotokoll beim Durchklicken ist leer außer eigenen Dateien.

## Risiken

- **Gültigkeit:** ohne Schematron kann eine Datei die Vorprüfung bestehen und trotzdem abgelehnt werden. Gegenmittel: manueller Lauf durch den KoSIT-Validator, offene Kennzeichnung als Vorprüfung.
- **Standard ändert sich:** XRechnung bekommt jährlich Versionen. Die Kennung steht an einer Stelle und ist versioniert.
- **Recht:** Kleinunternehmer dürfen weiter Papier- oder PDF-Rechnungen schreiben. Die App sagt das ehrlich und behauptet keine Pflicht.
- **Lesen fremder Dateien:** Rechnungen anderer Software nutzen Felder, die v1 nicht kennt. Unbekannte Felder werden als Rohliste angezeigt statt verschluckt.
- **Name:** "rechnung" ist sehr generisch und schwer auffindbar. Repo-Name bleibt `rechnung`.
