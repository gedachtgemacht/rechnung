/* Tests für logik.js: node --test oder node test-calc.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./logik.js');

const PROFIL = {
  name: 'Muster Grafik', strasse: 'Beispielweg 12', plz: '12345', ort: 'Musterstadt', land: 'DE',
  steuernummer: '123/456/78901', ustid: '', kontaktName: 'Mia Muster', telefon: '0123 456789',
  email: ['rechnung', 'muster-grafik.example'].join(String.fromCharCode(64)), iban: 'DE02 1203 0000 0000 2020 51', bic: '', kleinunternehmer: false,
};
const KUNDE = {
  id: 'k1', name: 'Erfunden Werkstatt GmbH', strasse: 'Probestraße 5', plz: '54321', ort: 'Beispielhausen',
  land: 'DE', email: ['einkauf', 'erfunden-werkstatt.example'].join(String.fromCharCode(64)), kaeuferreferenz: 'REF-1',
};
const R1 = {
  id: 'r1', nummer: 'RE-001', datum: '2026-10-01', faellig: '2026-10-15', leistungVon: '2026-09-01', leistungBis: '2026-09-30',
  kundeId: 'k1',
  positionen: [
    { text: 'Gestaltung', menge: '10', einheit: 'HUR', preis: '85.00', satz: '19' },
    { text: 'Fachbuch', menge: '1', einheit: 'H87', preis: '49.90', satz: '7' },
  ],
};
const R2 = {
  id: 'r2', nummer: 'RE-002', datum: '2026-10-08', faellig: '2026-10-22', kundeId: 'k1',
  positionen: [{ text: 'Logo-Skizzen', menge: '3', einheit: 'H87', preis: '33.33', satz: '0' }],
};
const beispiel = (n) => fs.readFileSync(path.join(__dirname, 'test', 'beispiele', n), 'utf8');

/* ---------- Dezimalrechnung und Rundung ---------- */
test('Dezimal: lesen, rechnen, Text', () => {
  assert.equal(L.text(L.dez('12.345')), '12.345');
  assert.equal(L.text2(L.mal('1.5', '12.345')), '18.52');
  assert.equal(L.text(L.mal('1.5', '12.345')), '18.5175');
  assert.equal(L.text2(L.plus('0.1', '0.2')), '0.30');
  assert.equal(L.text2(L.minus('0.1', '0.3')), '-0.20');
  assert.equal(L.dez('abc'), null);
  assert.equal(L.dez(''), null);
  assert.equal(L.text(L.dezEingabe('1.234,5')), '1234.5');
  assert.equal(L.text(L.dezEingabe('85,00')), '85');
  assert.equal(L.betragDe('1064.89'), '1.064,89');
  assert.equal(L.betragDe('-0.13'), '−0,13');
  // Einzelpreise werden nicht gerundet angezeigt (Vektor 3: 12,345)
  assert.equal(L.preisDe('12.345'), '12,345');
  assert.equal(L.preisDe('85'), '85,00');
  assert.equal(L.preisDe('1234.5'), '1.234,50');
  assert.equal(L.preisDe('-0.125'), '−0,125');
});

test('Vektor 4: Rundung an der Grenze, ab 5 weg von null', () => {
  assert.equal(L.text2(L.zeile('1', '0.125')), '0.13');
  assert.equal(L.text2(L.zeile('1', '-0.125')), '-0.13');
  assert.equal(L.text2(L.runde2('0.124999')), '0.12');
  assert.equal(L.text2(L.runde2('-0.005')), '-0.01');
  assert.equal(L.text2(L.runde2('3.493')), '3.49');
});

/* ---------- Testvektoren ---------- */
test('Vektor 1: zwei Steuersätze', () => {
  const b = L.belegAusDaten(R1, PROFIL, KUNDE);
  assert.deepEqual(b.positionen.map((p) => p.betrag), ['850.00', '49.90']);
  const s19 = b.steuern.find((s) => s.satz === '19');
  const s7 = b.steuern.find((s) => s.satz === '7');
  assert.equal(s19.basis, '850.00');
  assert.equal(s19.steuer, '161.50');
  assert.equal(s7.basis, '49.90');
  assert.equal(s7.steuer, '3.49');
  assert.equal(b.summen.netto, '899.90');
  assert.equal(b.summen.steuer, '164.99');
  assert.equal(b.summen.brutto, '1064.89');
  assert.equal(b.summen.zahlbar, '1064.89');
});

test('Vektor 2: Kleinunternehmer, Kategorie E', () => {
  const b = L.belegAusDaten(R2, PROFIL, KUNDE);
  assert.equal(b.positionen[0].betrag, '99.99');
  assert.equal(b.positionen[0].kategorie, 'E');
  assert.equal(b.steuern.length, 1);
  assert.equal(b.steuern[0].kategorie, 'E');
  assert.equal(b.steuern[0].steuer, '0.00');
  assert.equal(b.steuern[0].grund, L.GRUND_KLEINUNTERNEHMER);
  assert.equal(b.summen.brutto, '99.99');
});

test('Vektor 3: Rundung und Dokumentnachlass', () => {
  const r = L.berechne({
    positionen: [{ menge: '1.5', preis: '12.345', kategorie: 'S', satz: '19' }],
    abschlaege: [{ zuschlag: false, betrag: '2.00', kategorie: 'S', satz: '19' }],
  });
  assert.equal(r.zeilen[0], '18.52');
  assert.equal(r.steuern[0].basis, '16.52');
  assert.equal(r.steuern[0].steuer, '3.14');
  assert.equal(r.netto, '16.52');
  assert.equal(r.brutto, '19.66');
});

/* ---------- XML-Parser ---------- */
test('Parser: Entities, Zeichenreferenzen, CDATA, Attribute', () => {
  const w = L.parseXml('<?xml version="1.0"?><a x="1 &amp; 2"><b>&lt;&gt;&amp;&quot;&apos;</b><c>&#252;&#xFC;</c><d><![CDATA[<roh>]]></d></a>');
  assert.equal(w.attrs.x, '1 & 2');
  assert.equal(w.kinder[0].text, '<>&"\'');
  assert.equal(w.kinder[1].text, 'üü');
  assert.equal(w.kinder[2].text, '<roh>');
});

test('Parser: Namensräume werden aufgelöst', () => {
  const w = L.parseXml('<p:a xmlns:p="urn:eins" xmlns="urn:zwei"><b/><p:c q:x="1" xmlns:q="urn:drei"/></p:a>');
  assert.equal(w.ns, 'urn:eins');
  assert.equal(w.local, 'a');
  assert.equal(w.kinder[0].ns, 'urn:zwei');
  assert.equal(w.kinder[1].ns, 'urn:eins');
  assert.equal(w.kinder[1].attrNs['urn:drei x'], '1');
  assert.throws(() => L.parseXml('<x:a/>'), L.XmlFehler);
});

test('Parser: DOCTYPE und fremde Entities werden abgelehnt (XXE)', () => {
  const xxe = '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY e SYSTEM "file:///etc/passwd">]><a>&e;</a>';
  assert.throws(() => L.parseXml(xxe), /DOCTYPE/);
  assert.throws(() => L.parseXml('<a>&e;</a>'), /Unbekannte Entity/);
  assert.throws(() => L.parseXml('<a>&#0;</a>'), /Ungültige Zeichenreferenz/);
});

test('Parser: kaputtes XML wird erkannt', () => {
  assert.throws(() => L.parseXml('<a><b></a>'), L.XmlFehler);
  assert.throws(() => L.parseXml('<a>'), L.XmlFehler);
  assert.throws(() => L.parseXml('<a/><b/>'), L.XmlFehler);
  assert.throws(() => L.parseXml('text'), L.XmlFehler);
  assert.throws(() => L.parseXml('<a x="1" x="2"/>'), L.XmlFehler);
  assert.throws(() => L.parseXml(''), L.XmlFehler);
});

/* ---------- CII schreiben ---------- */
test('CII: Pflichtelemente vorhanden', () => {
  const xml = L.erzeugeCII(L.belegAusDaten(R1, PROFIL, KUNDE));
  for (const s of [
    L.XRECHNUNG_KENNUNG, '<ram:ID>RE-001</ram:ID>', '<ram:TypeCode>380</ram:TypeCode>',
    '<udt:DateTimeString format="102">20261001</udt:DateTimeString>',
    '<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>', '<ram:TypeCode>58</ram:TypeCode>',
    '<ram:IBANID>DE02120300000000202051</ram:IBANID>', 'unitCode="HUR"', 'unitCode="H87"',
    '<ram:BuyerReference>REF-1</ram:BuyerReference>', 'schemeID="FC"', 'schemeID="EM"',
    '<ram:GrandTotalAmount>1064.89</ram:GrandTotalAmount>', '<ram:TaxTotalAmount currencyID="EUR">164.99</ram:TaxTotalAmount>',
    '<ram:ApplicableHeaderTradeDelivery/>',
  ]) assert.ok(xml.includes(s), 'fehlt: ' + s);
  assert.ok(!xml.includes('tag="1"'));
});

test('CII: Reihenfolge nach Schema', () => {
  const xml = L.erzeugeCII(L.belegAusDaten(R1, PROFIL, KUNDE));
  const folge = (liste) => {
    let pos = -1;
    for (const s of liste) {
      const p = xml.indexOf(s, pos + 1);
      assert.ok(p > pos, s + ' steht an falscher Stelle');
      pos = p;
    }
  };
  folge(['<rsm:ExchangedDocumentContext>', '<rsm:ExchangedDocument>', '<rsm:SupplyChainTradeTransaction>',
    '<ram:IncludedSupplyChainTradeLineItem>', '<ram:ApplicableHeaderTradeAgreement>',
    '<ram:ApplicableHeaderTradeDelivery', '<ram:ApplicableHeaderTradeSettlement>']);
  folge(['<ram:BusinessProcessSpecifiedDocumentContextParameter>', '<ram:GuidelineSpecifiedDocumentContextParameter>']);
  folge(['<ram:SellerTradeParty>', '<ram:Name>', '<ram:DefinedTradeContact>', '<ram:PostalTradeAddress>',
    '<ram:URIUniversalCommunication>', '<ram:SpecifiedTaxRegistration>', '<ram:BuyerTradeParty>']);
  folge(['<ram:InvoiceCurrencyCode>', '<ram:SpecifiedTradeSettlementPaymentMeans>', '<ram:ApplicableTradeTax>',
    '<ram:BillingSpecifiedPeriod>', '<ram:SpecifiedTradePaymentTerms>', '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>']);
  folge(['<ram:LineTotalAmount>899.90', '<ram:TaxBasisTotalAmount>', '<ram:TaxTotalAmount', '<ram:GrandTotalAmount>', '<ram:DuePayableAmount>']);
  /* Steueraufschlüsselung im Kopf: CalculatedAmount vor BasisAmount vor CategoryCode */
  const kopf = xml.slice(xml.indexOf('<ram:ApplicableHeaderTradeSettlement>'));
  assert.ok(kopf.indexOf('<ram:CalculatedAmount>') < kopf.indexOf('<ram:BasisAmount>'));
  assert.ok(kopf.indexOf('<ram:BasisAmount>') < kopf.indexOf('<ram:CategoryCode>'));
});

test('CII: Sonderzeichen werden maskiert', () => {
  const r = { ...R1, nummer: 'A&B<1>', positionen: [{ text: 'Tür "groß" & <klein>', menge: '1', einheit: 'LS', preis: '1', satz: '19' }] };
  const xml = L.erzeugeCII(L.belegAusDaten(r, PROFIL, KUNDE));
  assert.ok(xml.includes('A&amp;B&lt;1&gt;'));
  const b = L.lese(xml);
  assert.equal(b.nummer, 'A&B<1>');
  assert.equal(b.positionen[0].text, 'Tür "groß" & <klein>');
});

test('Dateiname', () => {
  assert.equal(L.dateiname('RE-001'), 'RE-001.xml');
  assert.equal(L.dateiname('RE/2026 1'), 'RE_2026_1.xml');
});

/* ---------- Round-Trip ---------- */
for (const [name, r] of [['Vektor 1', R1], ['Vektor 2', R2]]) {
  test('Round-Trip ' + name, () => {
    const b = L.belegAusDaten(r, PROFIL, KUNDE);
    const g = L.lese(L.erzeugeCII(b));
    assert.equal(g.syntax, 'CII');
    for (const f of ['nummer', 'typ', 'datum', 'faellig', 'waehrung', 'kaeuferreferenz', 'spezifikation', 'leistungVon', 'leistungBis']) {
      assert.equal(g[f], b[f], f);
    }
    for (const f of ['name', 'strasse', 'plz', 'ort', 'land', 'steuernummer', 'kontaktName', 'telefon', 'email']) {
      assert.equal(g.verkaeufer[f], b.verkaeufer[f], 'verkaeufer.' + f);
    }
    for (const f of ['name', 'strasse', 'plz', 'ort', 'land']) assert.equal(g.kaeufer[f], b.kaeufer[f], 'kaeufer.' + f);
    assert.equal(g.zahlung.iban, b.zahlung.iban);
    assert.equal(g.positionen.length, b.positionen.length);
    g.positionen.forEach((p, i) => {
      assert.equal(p.text, b.positionen[i].text);
      assert.ok(L.gleich(p.menge, b.positionen[i].menge));
      assert.ok(L.gleich(p.preis, b.positionen[i].preis));
      assert.equal(p.einheit, b.positionen[i].einheit);
      assert.equal(p.betrag, b.positionen[i].betrag);
    });
    for (const f of ['zeilen', 'netto', 'steuer', 'brutto', 'zahlbar']) assert.equal(g.summen[f], b.summen[f], 'summe ' + f);
    assert.equal(g.steuern.length, b.steuern.length);
    const n = L.nachrechnen(g);
    assert.ok(n.stimmt, JSON.stringify(n.vergleiche.filter((x) => !x.ok)));
    const fehler = L.pruefe(g).filter((x) => x.stufe !== 'ok');
    assert.deepEqual(fehler, []);
    assert.deepEqual(g.unbekannt, []);
  });
}

/* ---------- Beispieldateien lesen ---------- */
test('Beispiel UBL mit Nachlass (Vektor 3)', () => {
  const b = L.lese(beispiel('ubl-nachlass.xml'));
  assert.equal(b.syntax, 'UBL');
  assert.equal(b.nummer, 'UBL-2026-17');
  assert.equal(b.hinweise[0], 'Danke für den Auftrag & bis bald.');
  assert.equal(b.verkaeufer.name, 'Lieferant Beispiel GmbH');
  assert.equal(b.verkaeufer.ustid, 'DE123456789');
  assert.equal(b.kaeufer.adresse.wert, ['eingang', 'amt.example'].join(String.fromCharCode(64)));
  const n = L.nachrechnen(b);
  assert.equal(n.ergebnis.brutto, '19.66');
  assert.equal(n.ergebnis.steuern[0].steuer, '3.14');
  assert.ok(n.stimmt);
  assert.ok(b.unbekannt.some((u) => u.wert === 'blau'), 'unbekannte Felder werden gelistet');
  assert.deepEqual(L.pruefe(b).filter((x) => x.stufe !== 'ok'), []);
});

test('Beispiel CII mit Nachlass, Zuschlag, Basismenge und Vorauszahlung', () => {
  const b = L.lese(beispiel('cii-zuschlag.xml'));
  assert.equal(b.nummer, 'CII-4711');
  assert.equal(b.hinweise[0], 'Lieferung <frei Haus>');
  const n = L.nachrechnen(b);
  assert.deepEqual(n.ergebnis.zeilen, ['99.96', '22.50']);
  assert.equal(n.ergebnis.netto, '122.46');
  assert.equal(n.ergebnis.steuerGesamt, '20.87');
  assert.equal(n.ergebnis.brutto, '143.33');
  assert.equal(n.ergebnis.zahlbar, '93.33');
  assert.ok(n.stimmt);
  assert.deepEqual(L.pruefe(b).filter((x) => x.stufe !== 'ok'), []);
  assert.ok(b.unbekannt.some((u) => u.wert === '20261002'), 'Lieferdatum taucht als unbekannt auf');
});

test('Abweichung wird markiert', () => {
  const xml = beispiel('cii-zuschlag.xml').replace('<ram:GrandTotalAmount>143.33', '<ram:GrandTotalAmount>143.34');
  const n = L.nachrechnen(L.lese(xml));
  assert.equal(n.stimmt, false);
  const f = n.vergleiche.find((x) => x.was === 'Brutto');
  assert.equal(f.ok, false);
  assert.equal(f.angegeben, '143.34');
  assert.equal(f.gerechnet, '143.33');
});

test('Eingebettetes Beispiel der Demoseite zeigt genau die absichtliche Abweichung', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const m = /<script type="text\/plain" id="bsp-ubl">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m);
  const n = L.nachrechnen(L.lese(m[1].trim()));
  const falsch = n.vergleiche.filter((x) => !x.ok).map((x) => x.was);
  assert.deepEqual(falsch, ['Brutto', 'Zahlbetrag']);
});

test('Fremdes Format wird abgelehnt', () => {
  assert.throws(() => L.lese('<html/>'), /Kein bekanntes Rechnungsformat/);
});

/* ---------- Prüfregeln: je ein positiver und ein negativer Fall ---------- */
function voll() {
  return JSON.parse(JSON.stringify(L.belegAusDaten(R1, PROFIL, KUNDE)));
}
function vollE() {
  return JSON.parse(JSON.stringify(L.belegAusDaten(R2, PROFIL, KUNDE)));
}
const stufe = (b, id) => {
  const r = L.pruefe(b).find((x) => x.id === id);
  return r ? r.stufe : 'nicht geprüft';
};

test('Prüfung: vollständige Rechnungen sind ohne Befund', () => {
  for (const b of [voll(), vollE()]) assert.deepEqual(L.pruefe(b).filter((x) => x.stufe !== 'ok'), []);
});

const FAELLE = {
  'BR-01': (b) => { b.spezifikation = ''; },
  'BR-02': (b) => { b.nummer = ' '; },
  'BR-03': (b) => { b.datum = ''; },
  'BR-04': (b) => { b.typ = ''; },
  'BR-05': (b) => { b.waehrung = ''; },
  'BR-06': (b) => { b.verkaeufer.name = ''; },
  'BR-07': (b) => { b.kaeufer.name = ''; },
  'BR-08': (b) => { Object.assign(b.verkaeufer, { strasse: '', plz: '', ort: '', land: '' }); },
  'BR-09': (b) => { b.verkaeufer.land = ''; },
  'BR-10': (b) => { Object.assign(b.kaeufer, { strasse: '', plz: '', ort: '', land: '' }); },
  'BR-11': (b) => { b.kaeufer.land = ''; },
  'BR-16': (b) => { b.positionen = []; },
  'BR-CO-10': (b) => { b.summen.zeilen = '899.91'; },
  'BR-CO-13': (b) => { b.summen.netto = '900.00'; },
  'BR-CO-14': (b) => { b.summen.steuer = '165.00'; },
  'BR-CO-15': (b) => { b.summen.brutto = '1064.90'; },
  'BR-CO-16': (b) => { b.summen.zahlbar = '1000.00'; },
  'BR-S-08': (b) => { b.steuern[0].basis = '851.00'; },
  'BR-S-09': (b) => { b.steuern[0].steuer = '161.51'; },
  'BR-DE-1': (b) => { b.zahlung.art = ''; },
  'BR-DE-2': (b) => { Object.assign(b.verkaeufer, { kontaktName: '', telefon: '', email: '', hatKontakt: false }); },
  'BR-DE-3': (b) => { b.verkaeufer.ort = ''; },
  'BR-DE-4': (b) => { b.verkaeufer.plz = ''; },
  'BR-DE-5': (b) => { b.verkaeufer.kontaktName = ''; },
  'BR-DE-6': (b) => { b.verkaeufer.telefon = ''; },
  'BR-DE-7': (b) => { b.verkaeufer.email = ''; },
  'BR-DE-8': (b) => { b.kaeufer.ort = ''; },
  'BR-DE-9': (b) => { b.kaeufer.plz = ''; },
  'BR-DE-15': (b) => { b.kaeuferreferenz = ''; },
  'BR-DE-16': (b) => { b.verkaeufer.steuernummer = ''; b.verkaeufer.ustid = ''; },
  'BR-DE-23-a': (b) => { b.zahlung.iban = ''; },
  'BR-CO-25': (b) => { b.faellig = ''; b.zahlung.bedingungen = ''; },
  'BT-34': (b) => { b.verkaeufer.adresse = null; },
  'BT-49': (b) => { b.kaeufer.adresse = { wert: '', schema: 'EM' }; },
};
const FAELLE_E = {
  'BR-E-08': (b) => { b.steuern[0].basis = '100.00'; },
  'BR-E-09': (b) => { b.steuern[0].steuer = '19.00'; },
  'BR-E-10': (b) => { b.steuern[0].grund = ''; b.steuern[0].grundCode = ''; },
};

for (const [id, kaputt] of Object.entries(FAELLE)) {
  test('Regel ' + id, () => {
    assert.equal(stufe(voll(), id), 'ok', 'positiver Fall');
    const b = voll();
    kaputt(b);
    assert.equal(stufe(b, id), 'fehler', 'negativer Fall');
  });
}
for (const [id, kaputt] of Object.entries(FAELLE_E)) {
  test('Regel ' + id, () => {
    assert.equal(stufe(vollE(), id), 'ok', 'positiver Fall');
    const b = vollE();
    kaputt(b);
    assert.equal(stufe(b, id), 'fehler', 'negativer Fall');
  });
}

test('Regel BR-DE-19: falsche IBAN ist eine Warnung', () => {
  assert.equal(stufe(voll(), 'BR-DE-19'), 'ok');
  const b = voll();
  b.zahlung.iban = 'DE02120300000000202052';
  assert.equal(stufe(b, 'BR-DE-19'), 'warnung');
  assert.ok(L.ibanGueltig('DE89 3704 0044 0532 0130 00'));
  assert.ok(!L.ibanGueltig('DE89370400440532013001'));
});

test('Jede Regel hat einen deutschen Text', () => {
  for (const r of L.pruefe(voll()).concat(L.pruefe(vollE()))) assert.ok(L.REGELN[r.id], r.id);
  for (const id of Object.keys(FAELLE).concat(Object.keys(FAELLE_E))) assert.ok(L.REGELN[id], id);
});

/* ---------- Nummernkreis, Export, Beispiele ---------- */
test('Nummernkreis', () => {
  assert.equal(L.nummerVorschlag({ praefix: 'RE-2026-', naechsteNummer: 7 }), 'RE-2026-007');
  assert.equal(L.nummerVorschlag({}), '001');
  assert.equal(L.nummerWeiter({ praefix: 'RE-', naechsteNummer: 7 }, 'RE-007').naechsteNummer, 8);
  assert.equal(L.nummerWeiter({ praefix: 'RE-', naechsteNummer: 7 }, 'RE-020').naechsteNummer, 21);
  assert.equal(L.nummerWeiter({ praefix: 'RE-', naechsteNummer: 7 }, 'SONDER-1').naechsteNummer, 7);
  assert.equal(L.nummerWeiter({ praefix: 'RE-', naechsteNummer: 7 }, 'RE-003').naechsteNummer, 7);
});

test('Export und Import', () => {
  const d = L.beispielDaten();
  const e = L.exportDaten({ ...d, einstellungen: { praefix: 'RE-', naechsteNummer: 4 } }, '2026-10-28');
  assert.equal(e.name, 'rechnung-export-2026-10-28.json');
  const zurueck = JSON.parse(JSON.stringify(e.daten));
  assert.equal(L.pruefeImport(zurueck).ok, true);
  assert.equal(L.pruefeImport({ ...zurueck, format: 'anders' }).ok, false);
  assert.equal(L.pruefeImport({ ...zurueck, version: 2 }).ok, false);
  assert.equal(L.pruefeImport(null).ok, false);
  const kaputt = JSON.parse(JSON.stringify(zurueck));
  kaputt.rechnungen[0].positionen[0].menge = 'zehn';
  assert.equal(L.pruefeImport(kaputt).ok, false);
});

test('Beispieldaten entsprechen den Testvektoren', () => {
  const d = L.beispielDaten();
  const k = d.kunden[0];
  const brutto = d.rechnungen.map((r) => L.belegAusDaten(r, d.profil, k).summen.brutto);
  assert.deepEqual(brutto, ['1064.89', '99.99', '22.04']);
  assert.ok(d.rechnungen.every((r) => r.beispiel === true));
  assert.ok(d.kunden.every((x) => x.beispiel === true));
});
