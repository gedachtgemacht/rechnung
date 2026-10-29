/* rechnung. Logik: reine Funktionen, laufen in Node und im Browser.
 * Dezimalrechnung mit BigInt, XML-Parser, XRechnung CII schreiben,
 * CII und UBL lesen, nachrechnen nach EN 16931, Vorprüfung ausgewählter Regeln.
 * Lizenz AGPL-3.0, gedacht.gemacht.
 */
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.Logik = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Kennung der Spezifikation, die beim Schreiben verwendet wird. Steht nur hier. */
  const XRECHNUNG_KENNUNG = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
  const PROZESS_KENNUNG = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
  const GRUND_KLEINUNTERNEHMER = 'Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG';

  const EINHEITEN = { H87: 'Stück', HUR: 'Stunde', DAY: 'Tag', LS: 'Pauschale' };
  const EINHEITEN_MEHR = { H87: 'Stück', HUR: 'Stunden', DAY: 'Tage', LS: 'Pauschale' };

  /* ---------- Dezimalzahlen ----------
   * Eine Zahl ist { v: BigInt, e: Zahl } und bedeutet v × 10^-e.
   */
  const P10 = [];
  function p10(n) {
    if (P10[n] === undefined) P10[n] = 10n ** BigInt(n);
    return P10[n];
  }

  function dez(x) {
    if (x && typeof x === 'object' && typeof x.v === 'bigint') return x;
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) return null;
      x = String(x);
    }
    if (typeof x !== 'string') return null;
    const s = x.trim();
    const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return null;
    const ganz = m[2] || '0';
    const nach = m[3] || '';
    let v = BigInt(ganz + nach);
    if (m[1] === '-') v = -v;
    return { v, e: nach.length };
  }

  /* Eingabe aus dem Formular: Komma als Dezimaltrenner, Tausenderpunkte nur bei Komma. */
  function dezEingabe(s) {
    if (typeof s !== 'string') return dez(s);
    let t = s.trim().replace(/\s/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    return dez(t);
  }

  function aufStellen(a, e) {
    return e >= a.e ? { v: a.v * p10(e - a.e), e } : a;
  }
  function plus(a, b) {
    a = dez(a); b = dez(b);
    const e = Math.max(a.e, b.e);
    return { v: aufStellen(a, e).v + aufStellen(b, e).v, e };
  }
  function minus(a, b) {
    b = dez(b);
    return plus(a, { v: -b.v, e: b.e });
  }
  function mal(a, b) {
    a = dez(a); b = dez(b);
    return { v: a.v * b.v, e: a.e + b.e };
  }
  function vergleich(a, b) {
    const d = minus(a, b).v;
    return d === 0n ? 0 : d > 0n ? 1 : -1;
  }
  function gleich(a, b) {
    return vergleich(a, b) === 0;
  }

  /* Bruch zaehler/nenner auf n Stellen, kaufmännisch: ab 5 weg von null. */
  function rundeBruch(zaehler, nenner, n) {
    if (nenner === 0n) throw new Error('Division durch null');
    const neg = (zaehler < 0n) !== (nenner < 0n);
    const z = (zaehler < 0n ? -zaehler : zaehler) * p10(n);
    const d = nenner < 0n ? -nenner : nenner;
    let q = z / d;
    const r = z % d;
    if (2n * r >= d) q += 1n;
    return { v: neg ? -q : q, e: n };
  }
  function runde(a, n) {
    a = dez(a);
    if (a.e <= n) return aufStellen(a, n);
    return rundeBruch(a.v, p10(a.e), n);
  }
  function runde2(a) {
    return runde(a, 2);
  }
  function geteilt(a, b, n) {
    a = dez(a); b = dez(b);
    return rundeBruch(a.v * p10(b.e), b.v * p10(a.e), n);
  }

  /* Text mit genau n Stellen, ohne n: ohne überflüssige Nullen. */
  function text(a, n) {
    a = dez(a);
    if (n !== undefined) a = runde(a, n);
    const neg = a.v < 0n;
    let s = (neg ? -a.v : a.v).toString();
    if (a.e > 0) {
      s = s.padStart(a.e + 1, '0');
      s = s.slice(0, s.length - a.e) + '.' + s.slice(s.length - a.e);
      if (n === undefined) s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    if (neg && /[1-9]/.test(s)) s = '-' + s;
    return s;
  }
  const text2 = (a) => text(a, 2);
  const NULL = { v: 0n, e: 0 };

  /* Betrag für die Anzeige: 1.064,89 */
  function betragDe(a) {
    const s = text2(a);
    const neg = s.startsWith('-');
    const [g, k] = (neg ? s.slice(1) : s).split('.');
    return (neg ? '−' : '') + g.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + k;
  }
  /* Einzelpreis: alle Nachkommastellen, mindestens zwei, nichts gerundet. */
  function preisDe(a) {
    let s = text(a);
    const neg = s.startsWith('-');
    if (neg) s = s.slice(1);
    let [g, k] = s.split('.');
    k = (k || '').padEnd(2, '0');
    return (neg ? '−' : '') + g.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + k;
  }
  function zahlDe(a) {
    return text(a).replace('-', '−').replace('.', ',');
  }

  /* ---------- Rechnen nach EN 16931 ---------- */

  /* BT-131: menge × preis / basismenge, gerundet, plus Zuschläge, minus Nachlässe der Zeile. */
  function zeile(menge, preis, basismenge, zuschlaege, nachlaesse) {
    let b;
    const bm = basismenge === undefined || basismenge === null || basismenge === '' ? null : dez(basismenge);
    if (bm && !gleich(bm, '1')) {
      const p = mal(menge, preis);
      b = geteilt(p, bm, 2);
    } else {
      b = runde2(mal(menge, preis));
    }
    for (const z of zuschlaege || []) b = plus(b, z);
    for (const n of nachlaesse || []) b = minus(b, n);
    return runde2(b);
  }

  function satzSchluessel(kategorie, satz) {
    return (kategorie || 'S') + '|' + text(dez(satz || '0') || NULL);
  }

  /* beleg siehe belegAusDaten bzw. lese(). Ergebnis: alle Beträge als Strings mit 2 Stellen. */
  function berechne(beleg) {
    const zeilen = [];
    const gruppen = new Map();
    function gruppe(kat, satz) {
      const k = satzSchluessel(kat, satz);
      if (!gruppen.has(k)) gruppen.set(k, { kategorie: kat || 'S', satz: text(dez(satz || '0') || NULL), basis: NULL });
      return gruppen.get(k);
    }
    let summeZeilen = NULL;
    for (const p of beleg.positionen || []) {
      const m = dez(p.menge), pr = dez(p.preis);
      const z = m && pr ? zeile(m, pr, p.basismenge, p.zuschlaege, p.nachlaesse) : NULL;
      zeilen.push(text2(z));
      summeZeilen = plus(summeZeilen, z);
      const g = gruppe(p.kategorie, p.satz);
      g.basis = plus(g.basis, z);
    }
    let nachlaesse = NULL, zuschlaege = NULL;
    for (const a of beleg.abschlaege || []) {
      const b = dez(a.betrag) || NULL;
      const g = gruppe(a.kategorie, a.satz);
      if (a.zuschlag) { zuschlaege = plus(zuschlaege, b); g.basis = plus(g.basis, b); }
      else { nachlaesse = plus(nachlaesse, b); g.basis = minus(g.basis, b); }
    }
    const steuern = [];
    let steuerGesamt = NULL;
    for (const g of gruppen.values()) {
      const st = runde2(geteilt(mal(g.basis, g.satz), '100', 6));
      steuerGesamt = plus(steuerGesamt, st);
      steuern.push({ kategorie: g.kategorie, satz: g.satz, basis: text2(g.basis), steuer: text2(st) });
    }
    steuern.sort((a, b) => vergleich(b.satz, a.satz) || a.kategorie.localeCompare(b.kategorie));
    const netto = plus(minus(summeZeilen, nachlaesse), zuschlaege);
    const brutto = plus(netto, steuerGesamt);
    const voraus = dez((beleg.summen && beleg.summen.vorauszahlung) || '0') || NULL;
    const rundung = dez((beleg.summen && beleg.summen.rundung) || '0') || NULL;
    const zahlbar = plus(minus(brutto, voraus), rundung);
    return {
      zeilen,
      steuern,
      summeZeilen: text2(summeZeilen),
      nachlaesse: text2(nachlaesse),
      zuschlaege: text2(zuschlaege),
      netto: text2(netto),
      steuerGesamt: text2(steuerGesamt),
      brutto: text2(brutto),
      vorauszahlung: text2(voraus),
      zahlbar: text2(zahlbar),
    };
  }

  /* ---------- XML-Parser ----------
   * Elemente, Attribute, Text, CDATA, Namensräume, fünf Standard-Entities,
   * numerische Zeichenreferenzen. DOCTYPE und eigene Entities werden abgelehnt.
   */
  const NS_XML = 'http://www.w3.org/XML/1998/namespace';
  const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

  class XmlFehler extends Error {
    constructor(meldung, pos) {
      super(meldung + (pos !== undefined ? ' (Zeichen ' + pos + ')' : ''));
      this.name = 'XmlFehler';
    }
  }

  function entschluessle(s, pos) {
    return s.replace(/&([^;&\s]*);?/g, (ganz, name, off) => {
      if (!ganz.endsWith(';')) throw new XmlFehler('Unvollständige Zeichenreferenz', pos + off);
      if (name[0] === '#') {
        const cp = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        const gueltig = /^#(x[0-9a-fA-F]+|X[0-9a-fA-F]+|[0-9]+)$/.test(name);
        if (!gueltig || !Number.isFinite(cp) || cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
          throw new XmlFehler('Ungültige Zeichenreferenz &' + name + ';', pos + off);
        }
        return String.fromCodePoint(cp);
      }
      if (Object.prototype.hasOwnProperty.call(ENTITIES, name)) return ENTITIES[name];
      throw new XmlFehler('Unbekannte Entity &' + name + ';', pos + off);
    });
  }

  const NAME = /^[A-Za-z_À-￿][\w.\-·À-￿]*(?::[A-Za-z_À-￿][\w.\-·À-￿]*)?$/;

  function parseXml(eingabe) {
    if (typeof eingabe !== 'string') throw new XmlFehler('Eingabe ist kein Text');
    let s = eingabe.charCodeAt(0) === 0xfeff ? eingabe.slice(1) : eingabe;
    let i = 0;
    const n = s.length;
    const stapel = [];
    let wurzel = null;

    function aufloesen(el, scope) {
      const teil = el.name.split(':');
      el.prefix = teil.length === 2 ? teil[0] : '';
      el.local = teil.length === 2 ? teil[1] : teil[0];
      if (!(el.prefix in scope)) throw new XmlFehler('Unbekanntes Namensraum-Präfix ' + el.prefix);
      el.ns = scope[el.prefix] || '';
    }

    while (i < n) {
      const lt = s.indexOf('<', i);
      const ende = lt === -1 ? n : lt;
      if (ende > i) {
        const roh = s.slice(i, ende);
        if (stapel.length) {
          const el = stapel[stapel.length - 1];
          const t = entschluessle(roh, i);
          el.text += t;
        } else if (roh.trim() !== '') {
          throw new XmlFehler('Text außerhalb des Wurzelelements', i);
        }
      }
      if (lt === -1) break;
      i = lt;
      if (s.startsWith('<?', i)) {
        const e = s.indexOf('?>', i + 2);
        if (e === -1) throw new XmlFehler('Verarbeitungsanweisung nicht geschlossen', i);
        i = e + 2;
      } else if (s.startsWith('<!--', i)) {
        const e = s.indexOf('-->', i + 4);
        if (e === -1) throw new XmlFehler('Kommentar nicht geschlossen', i);
        i = e + 3;
      } else if (s.startsWith('<![CDATA[', i)) {
        const e = s.indexOf(']]>', i + 9);
        if (e === -1) throw new XmlFehler('CDATA nicht geschlossen', i);
        if (!stapel.length) throw new XmlFehler('CDATA außerhalb des Wurzelelements', i);
        stapel[stapel.length - 1].text += s.slice(i + 9, e);
        i = e + 3;
      } else if (s.startsWith('<!', i)) {
        throw new XmlFehler('DOCTYPE und Deklarationen sind nicht erlaubt', i);
      } else if (s.startsWith('</', i)) {
        const e = s.indexOf('>', i);
        if (e === -1) throw new XmlFehler('Endtag nicht geschlossen', i);
        const name = s.slice(i + 2, e).trim();
        const el = stapel.pop();
        if (!el || el.name !== name) throw new XmlFehler('Endtag </' + name + '> passt nicht', i);
        i = e + 1;
      } else {
        /* Starttag */
        let j = i + 1;
        const m = /^[^\s/>]+/.exec(s.slice(j, j + 512));
        if (!m || !NAME.test(m[0])) throw new XmlFehler('Ungültiger Elementname', i);
        const el = { name: m[0], attrs: {}, attrNs: {}, kinder: [], text: '', eltern: null };
        j += m[0].length;
        const rohAttrs = [];
        let leer = false;
        for (;;) {
          while (j < n && /\s/.test(s[j])) j++;
          if (j >= n) throw new XmlFehler('Starttag nicht geschlossen', i);
          if (s[j] === '>') { j++; break; }
          if (s[j] === '/' && s[j + 1] === '>') { j += 2; leer = true; break; }
          const am = /^([^\s=/>]+)\s*=\s*(["'])/.exec(s.slice(j, j + 512));
          if (!am || !NAME.test(am[1])) throw new XmlFehler('Ungültiges Attribut', j);
          const q = am[2];
          const vs = j + am[0].length;
          const ve = s.indexOf(q, vs);
          if (ve === -1) throw new XmlFehler('Attributwert nicht geschlossen', j);
          const wert = s.slice(vs, ve);
          if (wert.includes('<')) throw new XmlFehler('Zeichen < im Attributwert', vs);
          if (rohAttrs.some((a) => a[0] === am[1])) throw new XmlFehler('Attribut doppelt: ' + am[1], j);
          rohAttrs.push([am[1], entschluessle(wert, vs).replace(/[\t\n\r]/g, ' ')]);
          j = ve + 1;
        }
        const eltern = stapel.length ? stapel[stapel.length - 1] : null;
        const scope = Object.create(eltern ? eltern.scope : { '': '', xml: NS_XML });
        for (const [k, v] of rohAttrs) {
          if (k === 'xmlns') scope[''] = v;
          else if (k.startsWith('xmlns:')) {
            if (v === '') throw new XmlFehler('Leerer Namensraum für Präfix ' + k.slice(6));
            scope[k.slice(6)] = v;
          }
        }
        el.scope = scope;
        aufloesen(el, scope);
        for (const [k, v] of rohAttrs) {
          if (k === 'xmlns' || k.startsWith('xmlns:')) continue;
          el.attrs[k] = v;
          const t = k.split(':');
          const lokal = t.length === 2 ? t[1] : t[0];
          if (t.length === 2) {
            if (!(t[0] in scope)) throw new XmlFehler('Unbekanntes Namensraum-Präfix ' + t[0]);
            el.attrNs[scope[t[0]] + ' ' + lokal] = v;
          } else {
            el.attrNs[lokal] = v;
          }
        }
        if (eltern) { el.eltern = eltern; eltern.kinder.push(el); }
        else if (wurzel) throw new XmlFehler('Mehr als ein Wurzelelement', i);
        else wurzel = el;
        if (!leer) stapel.push(el);
        i = j;
      }
    }
    if (stapel.length) throw new XmlFehler('Element <' + stapel[stapel.length - 1].name + '> nicht geschlossen');
    if (!wurzel) throw new XmlFehler('Kein Wurzelelement gefunden');
    return wurzel;
  }

  /* ---------- XML schreiben ---------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Baum aus [name, attrs?, ...kinder] bzw. Text; leere Zweige (null) entfallen. */
  function knoten(name, attrs, ...kinder) {
    if (attrs === null || typeof attrs !== 'object' || Array.isArray(attrs) || Array.isArray(attrs.kinder)) {
      kinder.unshift(attrs);
      attrs = {};
    }
    const k = kinder.flat().filter((x) => x !== null && x !== undefined && x !== '');
    if (!k.length) return null;
    return { name, attrs, kinder: k };
  }
  function blatt(name, wert, attrs) {
    if (wert === null || wert === undefined || String(wert).trim() === '') return null;
    return { name, attrs: attrs || {}, kinder: [String(wert)] };
  }
  function serialisiere(k, tiefe) {
    const ein = '  '.repeat(tiefe);
    const a = Object.entries(k.attrs).map(([n, v]) => ' ' + n + '="' + esc(v) + '"').join('');
    if (!k.kinder.length) return ein + '<' + k.name + a + '/>\n';
    if (k.kinder.length === 1 && typeof k.kinder[0] === 'string') {
      return ein + '<' + k.name + a + '>' + esc(k.kinder[0]) + '</' + k.name + '>\n';
    }
    return ein + '<' + k.name + a + '>\n' + k.kinder.map((c) => serialisiere(c, tiefe + 1)).join('') + ein + '</' + k.name + '>\n';
  }

  const NS = {
    rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
    ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
    udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
    qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
    ublInv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    ublCn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
    cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  };

  function datum102(iso) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? m[1] + m[2] + m[3] : null;
  }
  function datumIso(s) {
    if (!s) return '';
    s = s.trim();
    let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : s;
  }
  function datumDe(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : iso || '';
  }
  function dtElement(name, iso) {
    const d = datum102(iso);
    return d ? knoten(name, { tag: 1 }, blatt('udt:DateTimeString', d, { format: '102' })) : null;
  }

  /* Rechnung aus den App-Daten in das gemeinsame Belegobjekt. Summen werden nachgerechnet. */
  function belegAusDaten(rechnung, profil, kunde) {
    profil = profil || {};
    kunde = kunde || {};
    const positionen = (rechnung.positionen || []).map((p, i) => {
      const satz = text(dezEingabe(String(p.satz ?? '19')) || NULL);
      const e = gleich(satz, '0');
      return {
        id: String(i + 1),
        text: p.text || '',
        menge: p.menge,
        einheit: p.einheit || 'H87',
        preis: p.preis,
        satz,
        kategorie: e ? 'E' : 'S',
      };
    });
    const beleg = {
      syntax: 'CII',
      spezifikation: XRECHNUNG_KENNUNG,
      prozess: PROZESS_KENNUNG,
      nummer: rechnung.nummer || '',
      typ: '380',
      datum: rechnung.datum || '',
      faellig: rechnung.faellig || '',
      waehrung: 'EUR',
      kaeuferreferenz: kunde.kaeuferreferenz || '',
      leistungVon: rechnung.leistungVon || '',
      leistungBis: rechnung.leistungBis || '',
      hinweise: rechnung.hinweis ? [rechnung.hinweis] : [],
      verkaeufer: {
        name: profil.name || '',
        strasse: profil.strasse || '',
        plz: profil.plz || '',
        ort: profil.ort || '',
        land: profil.land || 'DE',
        steuernummer: profil.steuernummer || '',
        ustid: profil.ustid || '',
        kontaktName: profil.kontaktName || '',
        telefon: profil.telefon || '',
        email: profil.email || '',
        adresse: profil.email ? { wert: profil.email, schema: 'EM' } : null,
      },
      kaeufer: {
        name: kunde.name || '',
        strasse: kunde.strasse || '',
        plz: kunde.plz || '',
        ort: kunde.ort || '',
        land: kunde.land || 'DE',
        email: kunde.email || '',
        adresse: kunde.email ? { wert: kunde.email, schema: 'EM' } : null,
      },
      zahlung: {
        art: '58',
        iban: (profil.iban || '').replace(/\s/g, '').toUpperCase(),
        bic: (profil.bic || '').replace(/\s/g, '').toUpperCase(),
        kontoinhaber: profil.name || '',
        bedingungen: rechnung.faellig ? 'Zahlbar bis ' + datumDe(rechnung.faellig) + ' ohne Abzug.' : '',
      },
      positionen,
      abschlaege: [],
      steuern: [],
      summen: {},
      unbekannt: [],
    };
    const r = berechne(beleg);
    positionen.forEach((p, i) => { p.betrag = r.zeilen[i]; });
    beleg.steuern = r.steuern.map((s) => ({
      ...s,
      grund: s.kategorie === 'E' ? GRUND_KLEINUNTERNEHMER : '',
    }));
    beleg.summen = {
      zeilen: r.summeZeilen,
      nachlaesse: null,
      zuschlaege: null,
      netto: r.netto,
      steuer: r.steuerGesamt,
      brutto: r.brutto,
      vorauszahlung: null,
      rundung: null,
      zahlbar: r.zahlbar,
    };
    return beleg;
  }

  /* XRechnung 3.0 in der Syntax CII (UN/CEFACT D16B), Reihenfolge nach Schema. */
  function erzeugeCII(b) {
    const v = b.verkaeufer, k = b.kaeufer, z = b.zahlung || {};
    const betrag = (name, wert, attrs) => blatt(name, text2(wert), attrs);
    const kontakt = knoten('ram:DefinedTradeContact',
      blatt('ram:PersonName', v.kontaktName),
      knoten('ram:TelephoneUniversalCommunication', blatt('ram:CompleteNumber', v.telefon)),
      knoten('ram:EmailURIUniversalCommunication', blatt('ram:URIID', v.email)));
    const anschrift = (p) => knoten('ram:PostalTradeAddress',
      blatt('ram:PostcodeCode', p.plz),
      blatt('ram:LineOne', p.strasse),
      blatt('ram:CityName', p.ort),
      blatt('ram:CountryID', p.land));
    const eAdresse = (a) => a && a.wert
      ? knoten('ram:URIUniversalCommunication', blatt('ram:URIID', a.wert, { schemeID: a.schema || 'EM' }))
      : null;

    const zeilen = b.positionen.map((p) => knoten('ram:IncludedSupplyChainTradeLineItem',
      knoten('ram:AssociatedDocumentLineDocument', blatt('ram:LineID', p.id)),
      knoten('ram:SpecifiedTradeProduct', blatt('ram:Name', p.text)),
      knoten('ram:SpecifiedLineTradeAgreement',
        knoten('ram:NetPriceProductTradePrice', blatt('ram:ChargeAmount', text(dez(p.preis))))),
      knoten('ram:SpecifiedLineTradeDelivery',
        blatt('ram:BilledQuantity', text(dez(p.menge)), { unitCode: p.einheit })),
      knoten('ram:SpecifiedLineTradeSettlement',
        knoten('ram:ApplicableTradeTax',
          blatt('ram:TypeCode', 'VAT'),
          blatt('ram:CategoryCode', p.kategorie),
          blatt('ram:RateApplicablePercent', p.satz)),
        knoten('ram:SpecifiedTradeSettlementLineMonetarySummation',
          betrag('ram:LineTotalAmount', p.betrag)))));

    const steuern = b.steuern.map((s) => knoten('ram:ApplicableTradeTax',
      betrag('ram:CalculatedAmount', s.steuer),
      blatt('ram:TypeCode', 'VAT'),
      blatt('ram:ExemptionReason', s.grund),
      betrag('ram:BasisAmount', s.basis),
      blatt('ram:CategoryCode', s.kategorie),
      blatt('ram:RateApplicablePercent', s.satz)));

    const su = b.summen;
    const baum = knoten('rsm:CrossIndustryInvoice', {
      'xmlns:rsm': NS.rsm, 'xmlns:ram': NS.ram, 'xmlns:qdt': NS.qdt, 'xmlns:udt': NS.udt,
    },
    knoten('rsm:ExchangedDocumentContext',
      knoten('ram:BusinessProcessSpecifiedDocumentContextParameter', blatt('ram:ID', b.prozess)),
      knoten('ram:GuidelineSpecifiedDocumentContextParameter', blatt('ram:ID', b.spezifikation))),
    knoten('rsm:ExchangedDocument',
      blatt('ram:ID', b.nummer),
      blatt('ram:TypeCode', b.typ),
      knoten('ram:IssueDateTime', blatt('udt:DateTimeString', datum102(b.datum), { format: '102' })),
      (b.hinweise || []).map((h) => knoten('ram:IncludedNote', blatt('ram:Content', h)))),
    knoten('rsm:SupplyChainTradeTransaction',
      zeilen,
      knoten('ram:ApplicableHeaderTradeAgreement',
        blatt('ram:BuyerReference', b.kaeuferreferenz),
        knoten('ram:SellerTradeParty',
          blatt('ram:Name', v.name),
          kontakt,
          anschrift(v),
          eAdresse(v.adresse),
          knoten('ram:SpecifiedTaxRegistration', blatt('ram:ID', v.steuernummer, { schemeID: 'FC' })),
          knoten('ram:SpecifiedTaxRegistration', blatt('ram:ID', v.ustid, { schemeID: 'VA' }))),
        knoten('ram:BuyerTradeParty',
          blatt('ram:Name', k.name),
          anschrift(k),
          eAdresse(k.adresse))),
      /* Pflichtelement, darf leer sein */
      { name: 'ram:ApplicableHeaderTradeDelivery', attrs: {}, kinder: [] },
      knoten('ram:ApplicableHeaderTradeSettlement',
        blatt('ram:InvoiceCurrencyCode', b.waehrung),
        knoten('ram:SpecifiedTradeSettlementPaymentMeans',
          blatt('ram:TypeCode', z.art),
          knoten('ram:PayeePartyCreditorFinancialAccount',
            blatt('ram:IBANID', z.iban),
            blatt('ram:AccountName', z.kontoinhaber)),
          knoten('ram:PayeeSpecifiedCreditorFinancialInstitution', blatt('ram:BICID', z.bic))),
        steuern,
        knoten('ram:BillingSpecifiedPeriod',
          dtElement('ram:StartDateTime', b.leistungVon),
          dtElement('ram:EndDateTime', b.leistungBis)),
        knoten('ram:SpecifiedTradePaymentTerms',
          blatt('ram:Description', z.bedingungen),
          dtElement('ram:DueDateDateTime', b.faellig)),
        knoten('ram:SpecifiedTradeSettlementHeaderMonetarySummation',
          betrag('ram:LineTotalAmount', su.zeilen),
          betrag('ram:TaxBasisTotalAmount', su.netto),
          betrag('ram:TaxTotalAmount', su.steuer, { currencyID: b.waehrung }),
          betrag('ram:GrandTotalAmount', su.brutto),
          betrag('ram:DuePayableAmount', su.zahlbar)))));

    /* dtElement markiert seine Hülle mit tag:1, das ist kein echtes Attribut */
    (function saeubern(x) {
      if (!x || typeof x === 'string') return;
      delete x.attrs.tag;
      x.kinder.forEach(saeubern);
    })(baum);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialisiere(baum, 0);
  }

  function dateiname(nummer) {
    const n = String(nummer || 'rechnung').replace(/[\\/:*?"<>|\s]+/g, '_');
    return n + '.xml';
  }

  /* ---------- Lesen ---------- */

  /* Leser mit Buchführung: jedes gelesene Element wird markiert, Rest landet in "unbekannt". */
  function leser(wurzel) {
    const gelesen = new Set();
    function kinder(el, ns, local) {
      if (!el) return [];
      return el.kinder.filter((c) => c.ns === ns && c.local === local);
    }
    function pfad(el, ...schritte) {
      let akt = [el];
      for (const s of schritte) {
        const [p, l] = s.split(':');
        const nsUri = NS[p === 'rsm' || p === 'ram' || p === 'udt' || p === 'cac' || p === 'cbc' ? p : p];
        akt = akt.flatMap((e) => kinder(e, nsUri, l));
        if (!akt.length) return [];
      }
      return akt;
    }
    function eins(el, ...schritte) {
      const r = pfad(el, ...schritte);
      if (r[0]) gelesen.add(r[0]);
      return r[0] || null;
    }
    function alle(el, ...schritte) {
      const r = pfad(el, ...schritte);
      r.forEach((x) => gelesen.add(x));
      return r;
    }
    function t(el, ...schritte) {
      const x = schritte.length ? eins(el, ...schritte) : el;
      if (x) gelesen.add(x);
      return x ? x.text.trim() : '';
    }
    function attr(el, name) {
      return el ? el.attrNs[name] || '' : '';
    }
    function unbekannt() {
      const liste = [];
      (function geh(el, p) {
        const name = p ? p + '/' + el.local : el.local;
        if (!el.kinder.length) {
          if (!gelesen.has(el) && el.text.trim() !== '') liste.push({ pfad: name, wert: el.text.trim() });
        } else {
          el.kinder.forEach((c) => geh(c, name));
        }
      })(wurzel, '');
      return liste;
    }
    return { eins, alle, t, attr, unbekannt, markiere: (x) => x && gelesen.add(x) };
  }

  function steuerKennungen(L, liste) {
    let steuernummer = '', ustid = '';
    for (const r of liste) {
      const s = L.attr(r, 'schemeID');
      if (s === 'VA') ustid = ustid || L.t(r);
      else if (s === 'FC') steuernummer = steuernummer || L.t(r);
      else if (!ustid && /^[A-Z]{2}/.test(L.t(r))) ustid = L.t(r);
      else steuernummer = steuernummer || L.t(r);
    }
    return { steuernummer, ustid };
  }

  function leseCII(root) {
    const L = leser(root);
    const kopf = L.eins(root, 'rsm:ExchangedDocument');
    const ctx = L.eins(root, 'rsm:ExchangedDocumentContext');
    const tx = L.eins(root, 'rsm:SupplyChainTradeTransaction');
    const ag = L.eins(tx, 'ram:ApplicableHeaderTradeAgreement');
    const st = L.eins(tx, 'ram:ApplicableHeaderTradeSettlement');
    L.eins(tx, 'ram:ApplicableHeaderTradeDelivery');

    function partei(p) {
      if (!p) return { name: '', strasse: '', plz: '', ort: '', land: '', adresse: null };
      const a = L.eins(p, 'ram:PostalTradeAddress');
      const ea = L.eins(p, 'ram:URIUniversalCommunication', 'ram:URIID');
      const reg = steuerKennungen(L, L.alle(p, 'ram:SpecifiedTaxRegistration', 'ram:ID'));
      const kt = L.eins(p, 'ram:DefinedTradeContact');
      return {
        name: L.t(p, 'ram:Name'),
        strasse: [L.t(a, 'ram:LineOne'), L.t(a, 'ram:LineTwo'), L.t(a, 'ram:LineThree')].filter(Boolean).join(', '),
        plz: L.t(a, 'ram:PostcodeCode'),
        ort: L.t(a, 'ram:CityName'),
        land: L.t(a, 'ram:CountryID'),
        adresse: ea && ea.text.trim() ? { wert: L.t(ea), schema: L.attr(ea, 'schemeID') } : null,
        steuernummer: reg.steuernummer,
        ustid: reg.ustid,
        kontaktName: L.t(kt, 'ram:PersonName'),
        telefon: L.t(kt, 'ram:TelephoneUniversalCommunication', 'ram:CompleteNumber'),
        email: L.t(kt, 'ram:EmailURIUniversalCommunication', 'ram:URIID'),
        hatKontakt: !!kt,
      };
    }
    const datumAus = (el, ...p) => datumIso(L.t(el, ...p, 'udt:DateTimeString'));

    const positionen = L.alle(tx, 'ram:IncludedSupplyChainTradeLineItem').map((z) => {
      const ls = L.eins(z, 'ram:SpecifiedLineTradeSettlement');
      const steuer = L.eins(ls, 'ram:ApplicableTradeTax');
      const preisEl = L.eins(z, 'ram:SpecifiedLineTradeAgreement', 'ram:NetPriceProductTradePrice');
      const mengeEl = L.eins(z, 'ram:SpecifiedLineTradeDelivery', 'ram:BilledQuantity');
      const zus = [], nach = [];
      for (const ac of L.alle(ls, 'ram:SpecifiedTradeAllowanceCharge')) {
        const istZ = L.t(ac, 'ram:ChargeIndicator', 'udt:Indicator') === 'true';
        (istZ ? zus : nach).push(L.t(ac, 'ram:ActualAmount'));
        L.t(ac, 'ram:Reason');
      }
      return {
        id: L.t(z, 'ram:AssociatedDocumentLineDocument', 'ram:LineID'),
        text: L.t(z, 'ram:SpecifiedTradeProduct', 'ram:Name'),
        menge: L.t(mengeEl),
        einheit: L.attr(mengeEl, 'unitCode'),
        preis: L.t(preisEl, 'ram:ChargeAmount'),
        basismenge: L.t(preisEl, 'ram:BasisQuantity'),
        kategorie: L.t(steuer, 'ram:CategoryCode'),
        satz: L.t(steuer, 'ram:RateApplicablePercent'),
        betrag: L.t(ls, 'ram:SpecifiedTradeSettlementLineMonetarySummation', 'ram:LineTotalAmount'),
        zuschlaege: zus,
        nachlaesse: nach,
      };
    });
    positionen.forEach((p) => L.alle(tx, 'ram:IncludedSupplyChainTradeLineItem').forEach((z) => L.t(z, 'ram:SpecifiedLineTradeSettlement', 'ram:ApplicableTradeTax', 'ram:TypeCode')));

    const abschlaege = L.alle(st, 'ram:SpecifiedTradeAllowanceCharge').map((ac) => ({
      zuschlag: L.t(ac, 'ram:ChargeIndicator', 'udt:Indicator') === 'true',
      betrag: L.t(ac, 'ram:ActualAmount'),
      grund: L.t(ac, 'ram:Reason'),
      kategorie: L.t(ac, 'ram:CategoryTradeTax', 'ram:CategoryCode'),
      satz: L.t(ac, 'ram:CategoryTradeTax', 'ram:RateApplicablePercent'),
    }));
    L.alle(st, 'ram:SpecifiedTradeAllowanceCharge').forEach((ac) => L.t(ac, 'ram:CategoryTradeTax', 'ram:TypeCode'));

    const steuern = L.alle(st, 'ram:ApplicableTradeTax').map((s) => {
      L.t(s, 'ram:TypeCode');
      return {
        kategorie: L.t(s, 'ram:CategoryCode'),
        satz: L.t(s, 'ram:RateApplicablePercent'),
        basis: L.t(s, 'ram:BasisAmount'),
        steuer: L.t(s, 'ram:CalculatedAmount'),
        grund: L.t(s, 'ram:ExemptionReason'),
        grundCode: L.t(s, 'ram:ExemptionReasonCode'),
      };
    });

    const waehrung = L.t(st, 'ram:InvoiceCurrencyCode');
    const ms = L.eins(st, 'ram:SpecifiedTradeSettlementHeaderMonetarySummation');
    let steuerSumme = '';
    for (const x of L.alle(ms, 'ram:TaxTotalAmount')) {
      const c = L.attr(x, 'currencyID');
      if (!steuerSumme || !c || c === waehrung) steuerSumme = x.text.trim();
    }
    const pm = L.eins(st, 'ram:SpecifiedTradeSettlementPaymentMeans');
    const zt = L.eins(st, 'ram:SpecifiedTradePaymentTerms');
    const ein = (x) => x || null;

    const beleg = {
      syntax: 'CII',
      spezifikation: L.t(ctx, 'ram:GuidelineSpecifiedDocumentContextParameter', 'ram:ID'),
      prozess: L.t(ctx, 'ram:BusinessProcessSpecifiedDocumentContextParameter', 'ram:ID'),
      nummer: L.t(kopf, 'ram:ID'),
      typ: L.t(kopf, 'ram:TypeCode'),
      datum: datumAus(kopf, 'ram:IssueDateTime'),
      faellig: datumAus(zt, 'ram:DueDateDateTime'),
      waehrung,
      kaeuferreferenz: L.t(ag, 'ram:BuyerReference'),
      leistungVon: datumAus(st, 'ram:BillingSpecifiedPeriod', 'ram:StartDateTime'),
      leistungBis: datumAus(st, 'ram:BillingSpecifiedPeriod', 'ram:EndDateTime'),
      hinweise: L.alle(kopf, 'ram:IncludedNote').map((n) => L.t(n, 'ram:Content')).filter(Boolean),
      verkaeufer: partei(L.eins(ag, 'ram:SellerTradeParty')),
      kaeufer: partei(L.eins(ag, 'ram:BuyerTradeParty')),
      zahlung: pm ? {
        art: L.t(pm, 'ram:TypeCode'),
        iban: L.t(pm, 'ram:PayeePartyCreditorFinancialAccount', 'ram:IBANID'),
        kontoinhaber: L.t(pm, 'ram:PayeePartyCreditorFinancialAccount', 'ram:AccountName'),
        bic: L.t(pm, 'ram:PayeeSpecifiedCreditorFinancialInstitution', 'ram:BICID'),
        bedingungen: L.t(zt, 'ram:Description'),
      } : { art: '', iban: '', bic: '', kontoinhaber: '', bedingungen: L.t(zt, 'ram:Description') },
      positionen,
      abschlaege,
      steuern,
      summen: {
        zeilen: ein(L.t(ms, 'ram:LineTotalAmount')),
        zuschlaege: ein(L.t(ms, 'ram:ChargeTotalAmount')),
        nachlaesse: ein(L.t(ms, 'ram:AllowanceTotalAmount')),
        netto: ein(L.t(ms, 'ram:TaxBasisTotalAmount')),
        steuer: ein(steuerSumme),
        brutto: ein(L.t(ms, 'ram:GrandTotalAmount')),
        vorauszahlung: ein(L.t(ms, 'ram:TotalPrepaidAmount')),
        rundung: ein(L.t(ms, 'ram:RoundingAmount')),
        zahlbar: ein(L.t(ms, 'ram:DuePayableAmount')),
      },
    };
    beleg.unbekannt = L.unbekannt();
    return beleg;
  }

  function leseUBL(root) {
    const L = leser(root);
    const gutschrift = root.local === 'CreditNote';
    const zeilenName = gutschrift ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
    const mengenName = gutschrift ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';

    function partei(p) {
      if (!p) return { name: '', strasse: '', plz: '', ort: '', land: '', adresse: null };
      const a = L.eins(p, 'cac:PostalAddress');
      const ea = L.eins(p, 'cbc:EndpointID');
      const regs = L.alle(p, 'cac:PartyTaxScheme').map((x) => {
        const id = L.eins(x, 'cbc:CompanyID');
        const schema = L.t(x, 'cac:TaxScheme', 'cbc:ID');
        return { id: L.t(id), schema };
      });
      const ustid = (regs.find((r) => r.schema === 'VAT') || {}).id || '';
      const steuernummer = (regs.find((r) => r.schema !== 'VAT') || {}).id || '';
      const kt = L.eins(p, 'cac:Contact');
      const reg = L.t(p, 'cac:PartyLegalEntity', 'cbc:RegistrationName');
      const handel = L.t(p, 'cac:PartyName', 'cbc:Name');
      return {
        name: reg || handel,
        strasse: [L.t(a, 'cbc:StreetName'), L.t(a, 'cbc:AdditionalStreetName'), L.t(a, 'cac:AddressLine', 'cbc:Line')].filter(Boolean).join(', '),
        plz: L.t(a, 'cbc:PostalZone'),
        ort: L.t(a, 'cbc:CityName'),
        land: L.t(a, 'cac:Country', 'cbc:IdentificationCode'),
        adresse: ea && ea.text.trim() ? { wert: L.t(ea), schema: L.attr(ea, 'schemeID') } : null,
        steuernummer,
        ustid,
        kontaktName: L.t(kt, 'cbc:Name'),
        telefon: L.t(kt, 'cbc:Telephone'),
        email: L.t(kt, 'cbc:ElectronicMail'),
        hatKontakt: !!kt,
      };
    }

    const positionen = L.alle(root, zeilenName).map((z) => {
      const mengeEl = L.eins(z, mengenName);
      const zus = [], nach = [];
      for (const ac of L.alle(z, 'cac:AllowanceCharge')) {
        (L.t(ac, 'cbc:ChargeIndicator') === 'true' ? zus : nach).push(L.t(ac, 'cbc:Amount'));
        L.t(ac, 'cbc:AllowanceChargeReason');
      }
      const kat = L.eins(z, 'cac:Item', 'cac:ClassifiedTaxCategory');
      L.t(kat, 'cac:TaxScheme', 'cbc:ID');
      return {
        id: L.t(z, 'cbc:ID'),
        text: L.t(z, 'cac:Item', 'cbc:Name'),
        menge: L.t(mengeEl),
        einheit: L.attr(mengeEl, 'unitCode'),
        preis: L.t(z, 'cac:Price', 'cbc:PriceAmount'),
        basismenge: L.t(z, 'cac:Price', 'cbc:BaseQuantity'),
        kategorie: L.t(kat, 'cbc:ID'),
        satz: L.t(kat, 'cbc:Percent'),
        betrag: L.t(z, 'cbc:LineExtensionAmount'),
        zuschlaege: zus,
        nachlaesse: nach,
      };
    });

    const abschlaege = L.alle(root, 'cac:AllowanceCharge').map((ac) => {
      L.t(ac, 'cac:TaxCategory', 'cac:TaxScheme', 'cbc:ID');
      return {
        zuschlag: L.t(ac, 'cbc:ChargeIndicator') === 'true',
        betrag: L.t(ac, 'cbc:Amount'),
        grund: L.t(ac, 'cbc:AllowanceChargeReason'),
        kategorie: L.t(ac, 'cac:TaxCategory', 'cbc:ID'),
        satz: L.t(ac, 'cac:TaxCategory', 'cbc:Percent'),
      };
    });

    const waehrung = L.t(root, 'cbc:DocumentCurrencyCode');
    let steuerSumme = '';
    let steuern = [];
    for (const tt of L.alle(root, 'cac:TaxTotal')) {
      const ta = L.eins(tt, 'cbc:TaxAmount');
      const c = L.attr(ta, 'currencyID');
      if (!steuerSumme || !c || c === waehrung) {
        steuerSumme = L.t(ta);
        const subs = L.alle(tt, 'cac:TaxSubtotal');
        if (subs.length) {
          steuern = subs.map((s) => {
            L.t(s, 'cac:TaxCategory', 'cac:TaxScheme', 'cbc:ID');
            return {
              kategorie: L.t(s, 'cac:TaxCategory', 'cbc:ID'),
              satz: L.t(s, 'cac:TaxCategory', 'cbc:Percent'),
              basis: L.t(s, 'cbc:TaxableAmount'),
              steuer: L.t(s, 'cbc:TaxAmount'),
              grund: L.t(s, 'cac:TaxCategory', 'cbc:TaxExemptionReason'),
              grundCode: L.t(s, 'cac:TaxCategory', 'cbc:TaxExemptionReasonCode'),
            };
          });
        }
      }
    }
    const pm = L.eins(root, 'cac:PaymentMeans');
    const mt = L.eins(root, 'cac:LegalMonetaryTotal');
    const ein = (x) => x || null;
    const anhang = L.t(root, 'cbc:ProfileID');

    const beleg = {
      syntax: 'UBL',
      spezifikation: L.t(root, 'cbc:CustomizationID'),
      prozess: anhang,
      nummer: L.t(root, 'cbc:ID'),
      typ: L.t(root, gutschrift ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode'),
      datum: datumIso(L.t(root, 'cbc:IssueDate')),
      faellig: datumIso(L.t(root, 'cbc:DueDate')),
      waehrung,
      kaeuferreferenz: L.t(root, 'cbc:BuyerReference'),
      leistungVon: datumIso(L.t(root, 'cac:InvoicePeriod', 'cbc:StartDate')),
      leistungBis: datumIso(L.t(root, 'cac:InvoicePeriod', 'cbc:EndDate')),
      hinweise: L.alle(root, 'cbc:Note').map((n) => L.t(n)).filter(Boolean),
      verkaeufer: partei(L.eins(root, 'cac:AccountingSupplierParty', 'cac:Party')),
      kaeufer: partei(L.eins(root, 'cac:AccountingCustomerParty', 'cac:Party')),
      zahlung: pm ? {
        art: L.t(pm, 'cbc:PaymentMeansCode'),
        iban: L.t(pm, 'cac:PayeeFinancialAccount', 'cbc:ID'),
        kontoinhaber: L.t(pm, 'cac:PayeeFinancialAccount', 'cbc:Name'),
        bic: L.t(pm, 'cac:PayeeFinancialAccount', 'cac:FinancialInstitutionBranch', 'cbc:ID'),
        bedingungen: L.t(root, 'cac:PaymentTerms', 'cbc:Note'),
      } : { art: '', iban: '', bic: '', kontoinhaber: '', bedingungen: L.t(root, 'cac:PaymentTerms', 'cbc:Note') },
      positionen,
      abschlaege,
      steuern,
      summen: {
        zeilen: ein(L.t(mt, 'cbc:LineExtensionAmount')),
        zuschlaege: ein(L.t(mt, 'cbc:ChargeTotalAmount')),
        nachlaesse: ein(L.t(mt, 'cbc:AllowanceTotalAmount')),
        netto: ein(L.t(mt, 'cbc:TaxExclusiveAmount')),
        steuer: ein(steuerSumme),
        brutto: ein(L.t(mt, 'cbc:TaxInclusiveAmount')),
        vorauszahlung: ein(L.t(mt, 'cbc:PrepaidAmount')),
        rundung: ein(L.t(mt, 'cbc:PayableRoundingAmount')),
        zahlbar: ein(L.t(mt, 'cbc:PayableAmount')),
      },
    };
    beleg.unbekannt = L.unbekannt();
    return beleg;
  }

  /* XML-Text lesen, Syntax erkennen. Wirft XmlFehler bei kaputtem XML oder fremdem Format. */
  function lese(xml) {
    const root = parseXml(xml);
    if (root.ns === NS.rsm && root.local === 'CrossIndustryInvoice') return leseCII(root);
    if ((root.ns === NS.ublInv && root.local === 'Invoice') || (root.ns === NS.ublCn && root.local === 'CreditNote')) return leseUBL(root);
    throw new XmlFehler('Kein bekanntes Rechnungsformat (erwartet CII oder UBL), Wurzel ist ' + root.name);
  }

  /* ---------- Prüfen ---------- */

  function ibanGueltig(iban) {
    const s = String(iban || '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    if (s.startsWith('DE') && s.length !== 22) return false;
    const umgestellt = s.slice(4) + s.slice(0, 4);
    let rest = 0;
    for (const ch of umgestellt) {
      const z = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
      for (const d of z) rest = (rest * 10 + Number(d)) % 97;
    }
    return rest === 1;
  }

  const leer = (x) => x === undefined || x === null || String(x).trim() === '';
  const betragOk = (x) => !leer(x) && dez(x) !== null;
  const KATEGORIEN_MIT_STEUERNUMMER = ['S', 'Z', 'E', 'AE', 'K', 'G', 'L', 'M'];

  /* Regeltexte, Wortlaut sinngemäß aus EN 16931 und XRechnung, auf Deutsch gekürzt. */
  const REGELN = {
    'BR-01': 'Die Spezifikationskennung (BT-24) muss angegeben sein.',
    'BR-02': 'Die Rechnungsnummer (BT-1) muss angegeben sein.',
    'BR-03': 'Das Rechnungsdatum (BT-2) muss angegeben sein.',
    'BR-04': 'Der Rechnungstyp (BT-3) muss angegeben sein.',
    'BR-05': 'Der Währungscode (BT-5) muss angegeben sein.',
    'BR-06': 'Der Name des Verkäufers (BT-27) muss angegeben sein.',
    'BR-07': 'Der Name des Käufers (BT-44) muss angegeben sein.',
    'BR-08': 'Die Anschrift des Verkäufers (BG-5) muss angegeben sein.',
    'BR-09': 'Die Anschrift des Verkäufers braucht einen Ländercode (BT-40).',
    'BR-10': 'Die Anschrift des Käufers (BG-8) muss angegeben sein.',
    'BR-11': 'Die Anschrift des Käufers braucht einen Ländercode (BT-55).',
    'BR-16': 'Die Rechnung braucht mindestens eine Position (BG-25).',
    'BR-CO-10': 'Summe der Positionen (BT-106) = Summe aller Zeilenbeträge (BT-131).',
    'BR-CO-13': 'Netto (BT-109) = Summe Positionen (BT-106) − Nachlässe (BT-107) + Zuschläge (BT-108).',
    'BR-CO-14': 'Umsatzsteuer gesamt (BT-110) = Summe der Steuerbeträge je Satz (BT-117).',
    'BR-CO-15': 'Brutto (BT-112) = Netto (BT-109) + Umsatzsteuer (BT-110).',
    'BR-CO-16': 'Zahlbetrag (BT-115) = Brutto (BT-112) − Vorauszahlung (BT-113) + Rundung (BT-114).',
    'BR-S-08': 'Basis je Steuersatz der Kategorie S (BT-116) = Zeilenbeträge dieses Satzes − Nachlässe + Zuschläge.',
    'BR-S-09': 'Steuer je Satz der Kategorie S (BT-117) = Basis (BT-116) × Satz (BT-119), gerundet.',
    'BR-E-08': 'Basis der Kategorie E (BT-116) = Zeilenbeträge der Kategorie E − Nachlässe + Zuschläge.',
    'BR-E-09': 'Bei Kategorie E muss der Steuerbetrag (BT-117) 0 sein.',
    'BR-E-10': 'Bei Kategorie E braucht es einen Befreiungsgrund (BT-120 oder BT-121).',
    'BR-DE-1': 'Eine Zahlungsanweisung (BG-16) muss angegeben sein.',
    'BR-DE-2': 'Der Kontakt des Verkäufers (BG-6) muss angegeben sein.',
    'BR-DE-3': 'Der Ort des Verkäufers (BT-37) muss angegeben sein.',
    'BR-DE-4': 'Die Postleitzahl des Verkäufers (BT-38) muss angegeben sein.',
    'BR-DE-5': 'Der Kontaktname des Verkäufers (BT-41) muss angegeben sein.',
    'BR-DE-6': 'Die Telefonnummer des Verkäuferkontakts (BT-42) muss angegeben sein.',
    'BR-DE-7': 'Die E-Mail des Verkäuferkontakts (BT-43) muss angegeben sein.',
    'BR-DE-8': 'Der Ort des Käufers (BT-52) muss angegeben sein.',
    'BR-DE-9': 'Die Postleitzahl des Käufers (BT-53) muss angegeben sein.',
    'BR-DE-15': 'Die Käuferreferenz (BT-10), bei Behörden die Leitweg-ID, muss angegeben sein.',
    'BR-DE-16': 'Bei Kategorie S, Z, E, AE, K, G, L oder M braucht es Steuernummer (BT-32) oder USt-IdNr. (BT-31).',
    'BR-DE-19': 'Die IBAN (BT-84) sollte eine gültige IBAN sein.',
    'BR-DE-23-a': 'Bei Zahlungsart 58 (SEPA-Überweisung) braucht es eine IBAN (BT-84).',
    'BR-CO-25': 'Ist ein Betrag zu zahlen, braucht es ein Fälligkeitsdatum (BT-9) oder Zahlungsbedingungen (BT-20).',
    'BT-34': 'Die elektronische Adresse des Verkäufers (BT-34) muss angegeben sein.',
    'BT-49': 'Die elektronische Adresse des Käufers (BT-49) muss angegeben sein.',
  };

  /* Prüft einen Beleg. Ergebnis: [{ id, stufe: 'ok'|'warnung'|'fehler', regel, hinweis }]
   * stufe 'warnung' nur für Regeln, die auch in XRechnung nur Warnungen sind (BR-DE-19). */
  function pruefe(b) {
    const out = [];
    const v = b.verkaeufer || {}, k = b.kaeufer || {}, su = b.summen || {}, z = b.zahlung || {};
    function regel(id, ok, hinweis, warnStatt) {
      out.push({ id, stufe: ok ? 'ok' : warnStatt ? 'warnung' : 'fehler', regel: REGELN[id], hinweis: ok ? '' : hinweis || '' });
    }
    regel('BR-01', !leer(b.spezifikation), 'Keine Spezifikationskennung gefunden.');
    regel('BR-02', !leer(b.nummer), 'Rechnungsnummer fehlt.');
    regel('BR-03', !leer(b.datum), 'Rechnungsdatum fehlt.');
    regel('BR-04', !leer(b.typ), 'Rechnungstyp fehlt.');
    regel('BR-05', !leer(b.waehrung), 'Währung fehlt.');
    regel('BR-06', !leer(v.name), 'Name des Absenders fehlt.');
    regel('BR-07', !leer(k.name), 'Name des Kunden fehlt.');
    regel('BR-08', [v.strasse, v.plz, v.ort, v.land].some((x) => !leer(x)), 'Anschrift des Absenders fehlt.');
    regel('BR-09', !leer(v.land), 'Land des Absenders fehlt.');
    regel('BR-10', [k.strasse, k.plz, k.ort, k.land].some((x) => !leer(x)), 'Anschrift des Kunden fehlt.');
    regel('BR-11', !leer(k.land), 'Land des Kunden fehlt.');
    regel('BR-16', (b.positionen || []).length > 0, 'Keine Position vorhanden.');

    /* Summenregeln mit den Angaben aus der Datei */
    const pos = b.positionen || [];
    const zeilenOk = pos.every((p) => betragOk(p.betrag));
    if (zeilenOk && betragOk(su.zeilen)) {
      const s = pos.reduce((a, p) => plus(a, p.betrag), NULL);
      regel('BR-CO-10', gleich(s, su.zeilen), 'Angegeben ' + text2(su.zeilen) + ', Summe der Zeilen ' + text2(s) + '.');
    } else regel('BR-CO-10', false, 'Zeilenbeträge oder Summe der Positionen fehlen.');

    const nachlaesse = (b.abschlaege || []).filter((a) => !a.zuschlag).reduce((s, a) => plus(s, dez(a.betrag) || NULL), NULL);
    const zuschlaege = (b.abschlaege || []).filter((a) => a.zuschlag).reduce((s, a) => plus(s, dez(a.betrag) || NULL), NULL);
    if (betragOk(su.netto) && betragOk(su.zeilen)) {
      const n = plus(minus(su.zeilen, su.nachlaesse || nachlaesse), su.zuschlaege || zuschlaege);
      regel('BR-CO-13', gleich(n, su.netto), 'Angegeben ' + text2(su.netto) + ', erwartet ' + text2(n) + '.');
    } else regel('BR-CO-13', false, 'Nettosumme fehlt.');

    const steuern = b.steuern || [];
    if (betragOk(su.steuer) || steuern.length) {
      const s = steuern.reduce((a, x) => plus(a, dez(x.steuer) || NULL), NULL);
      const angegeben = dez(su.steuer || '0') || NULL;
      regel('BR-CO-14', gleich(s, angegeben), 'Angegeben ' + text2(angegeben) + ', Summe je Satz ' + text2(s) + '.');
    } else regel('BR-CO-14', false, 'Steuerangaben fehlen.');

    if (betragOk(su.brutto) && betragOk(su.netto)) {
      const e = plus(su.netto, su.steuer || '0');
      regel('BR-CO-15', gleich(e, su.brutto), 'Angegeben ' + text2(su.brutto) + ', erwartet ' + text2(e) + '.');
    } else regel('BR-CO-15', false, 'Bruttosumme fehlt.');

    if (betragOk(su.zahlbar) && betragOk(su.brutto)) {
      const e = plus(minus(su.brutto, su.vorauszahlung || '0'), su.rundung || '0');
      regel('BR-CO-16', gleich(e, su.zahlbar), 'Angegeben ' + text2(su.zahlbar) + ', erwartet ' + text2(e) + '.');
    } else regel('BR-CO-16', false, 'Zahlbetrag fehlt.');

    /* Basis je Kategorie und Satz */
    function erwarteteBasis(kat, satz) {
      const key = satzSchluessel(kat, satz);
      let s = NULL;
      for (const p of pos) if (satzSchluessel(p.kategorie, p.satz) === key && betragOk(p.betrag)) s = plus(s, p.betrag);
      for (const a of b.abschlaege || []) {
        if (satzSchluessel(a.kategorie, a.satz) !== key) continue;
        s = a.zuschlag ? plus(s, dez(a.betrag) || NULL) : minus(s, dez(a.betrag) || NULL);
      }
      return s;
    }
    for (const kat of ['S', 'E']) {
      const gr = steuern.filter((s) => s.kategorie === kat);
      const genutzt = pos.some((p) => p.kategorie === kat);
      if (!gr.length && !genutzt) continue;
      if (genutzt && !gr.length) {
        regel('BR-' + kat + '-08', false, 'Positionen mit Kategorie ' + kat + ', aber keine Steueraufschlüsselung dafür.');
        continue;
      }
      const falsch = [];
      for (const g of gr) {
        const e = erwarteteBasis(kat, g.satz);
        if (!betragOk(g.basis) || !gleich(e, g.basis)) falsch.push(text(dez(g.satz || '0') || NULL) + ' %: angegeben ' + (g.basis || 'nichts') + ', erwartet ' + text2(e));
      }
      regel('BR-' + kat + '-08', !falsch.length, falsch.join('; ') + '.');
      if (kat === 'S') {
        const f9 = [];
        for (const g of gr) {
          if (!betragOk(g.basis) || !betragOk(g.steuer)) { f9.push(g.satz + ' %: Betrag fehlt'); continue; }
          const e = runde2(geteilt(mal(g.basis, g.satz || '0'), '100', 6));
          if (!gleich(e, g.steuer)) f9.push(text(dez(g.satz || '0') || NULL) + ' %: angegeben ' + g.steuer + ', erwartet ' + text2(e));
        }
        regel('BR-S-09', !f9.length, f9.join('; ') + '.');
      } else {
        regel('BR-E-09', gr.every((g) => betragOk(g.steuer) && gleich(g.steuer, '0')), 'Steuerbetrag bei Kategorie E ist nicht 0.');
        regel('BR-E-10', gr.every((g) => !leer(g.grund) || !leer(g.grundCode)), 'Befreiungsgrund fehlt.');
      }
    }

    regel('BR-DE-1', !leer(z.art), 'Zahlungsart fehlt.');
    regel('BR-DE-2', !!(v.hatKontakt || v.kontaktName || v.telefon || v.email), 'Kontakt des Absenders fehlt.');
    regel('BR-DE-3', !leer(v.ort), 'Ort des Absenders fehlt.');
    regel('BR-DE-4', !leer(v.plz), 'Postleitzahl des Absenders fehlt.');
    regel('BR-DE-5', !leer(v.kontaktName), 'Kontaktname fehlt.');
    regel('BR-DE-6', !leer(v.telefon), 'Telefonnummer fehlt.');
    regel('BR-DE-7', !leer(v.email), 'E-Mail des Kontakts fehlt.');
    regel('BR-DE-8', !leer(k.ort), 'Ort des Kunden fehlt.');
    regel('BR-DE-9', !leer(k.plz), 'Postleitzahl des Kunden fehlt.');
    regel('BR-DE-15', !leer(b.kaeuferreferenz), 'Käuferreferenz fehlt. Bei Privat- und Firmenkunden reicht eine eigene Referenz, bei Behörden die Leitweg-ID.');
    const brauchtSteuernr = steuern.some((s) => KATEGORIEN_MIT_STEUERNUMMER.includes(s.kategorie)) ||
      pos.some((p) => KATEGORIEN_MIT_STEUERNUMMER.includes(p.kategorie));
    if (brauchtSteuernr) regel('BR-DE-16', !leer(v.steuernummer) || !leer(v.ustid), 'Steuernummer oder USt-IdNr. des Absenders fehlt.');
    if (String(z.art) === '58' || String(z.art) === '30') {
      regel('BR-DE-23-a', !leer(z.iban), 'IBAN fehlt.');
    }
    if (!leer(z.iban)) regel('BR-DE-19', ibanGueltig(z.iban), 'Die Prüfziffer der IBAN stimmt nicht.', true);
    if (betragOk(su.zahlbar) && vergleich(su.zahlbar, '0') > 0) {
      regel('BR-CO-25', !leer(b.faellig) || !leer(z.bedingungen), 'Fälligkeit oder Zahlungsbedingungen fehlen.');
    }
    regel('BT-34', !!(v.adresse && !leer(v.adresse.wert)), 'Elektronische Adresse des Absenders fehlt, zum Beispiel die E-Mail.');
    regel('BT-49', !!(k.adresse && !leer(k.adresse.wert)), 'Elektronische Adresse des Kunden fehlt, zum Beispiel die E-Mail.');
    return out;
  }

  /* Vergleich der angegebenen mit den nachgerechneten Beträgen.
   * Ergebnis: [{ was, angegeben, gerechnet, ok }] */
  function nachrechnen(b) {
    const r = berechne(b);
    const out = [];
    const vgl = (was, angegeben, gerechnet) => {
      if (leer(angegeben)) return;
      const a = dez(angegeben);
      out.push({ was, angegeben: a ? text2(a) : String(angegeben), gerechnet, ok: !!a && gleich(a, gerechnet) });
    };
    (b.positionen || []).forEach((p, i) => vgl('Zeile ' + (p.id || i + 1), p.betrag, r.zeilen[i]));
    for (const s of r.steuern) {
      const g = (b.steuern || []).find((x) => satzSchluessel(x.kategorie, x.satz) === satzSchluessel(s.kategorie, s.satz));
      const name = s.kategorie + ' ' + zahlDe(s.satz) + ' %';
      if (!g) { out.push({ was: 'Basis ' + name, angegeben: 'fehlt', gerechnet: s.basis, ok: false }); continue; }
      vgl('Basis ' + name, g.basis, s.basis);
      vgl('Steuer ' + name, g.steuer, s.steuer);
    }
    const su = b.summen || {};
    vgl('Summe Positionen', su.zeilen, r.summeZeilen);
    vgl('Nachlässe', su.nachlaesse, r.nachlaesse);
    vgl('Zuschläge', su.zuschlaege, r.zuschlaege);
    vgl('Netto', su.netto, r.netto);
    vgl('Umsatzsteuer', su.steuer, r.steuerGesamt);
    vgl('Brutto', su.brutto, r.brutto);
    vgl('Zahlbetrag', su.zahlbar, r.zahlbar);
    return { ergebnis: r, vergleiche: out, stimmt: out.every((x) => x.ok) };
  }

  /* ---------- Nummernkreis ---------- */
  function nummerVorschlag(einst) {
    const e = einst || {};
    const n = Math.max(1, parseInt(e.naechsteNummer, 10) || 1);
    return (e.praefix || '') + String(n).padStart(3, '0');
  }
  /* Nach dem Erstellen: Zähler weiter, wenn die Nummer aus dem Kreis stammt. */
  function nummerWeiter(einst, nummer) {
    const e = { praefix: '', naechsteNummer: 1, ...einst };
    const p = e.praefix || '';
    if (!String(nummer).startsWith(p)) return e;
    const rest = String(nummer).slice(p.length);
    if (!/^\d+$/.test(rest)) return e;
    const n = parseInt(rest, 10);
    if (n >= e.naechsteNummer) e.naechsteNummer = n + 1;
    return e;
  }

  /* ---------- Export und Import ---------- */
  const EXPORT_FORMAT = 'rechnung.';
  const EXPORT_VERSION = 1;
  function exportDaten(d, heute) {
    return {
      name: 'rechnung-export-' + heute + '.json',
      daten: {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        profil: d.profil || null,
        kunden: d.kunden || [],
        rechnungen: d.rechnungen || [],
        einstellungen: d.einstellungen || null,
      },
    };
  }
  /* Gibt { ok, fehler, daten } zurück. */
  function pruefeImport(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, fehler: 'Die Datei enthält kein JSON-Objekt.' };
    if (obj.format !== EXPORT_FORMAT) return { ok: false, fehler: 'Das ist kein Export von rechnung.' };
    if (obj.version !== EXPORT_VERSION) return { ok: false, fehler: 'Unbekannte Version ' + obj.version + '.' };
    if (!Array.isArray(obj.kunden) || !Array.isArray(obj.rechnungen)) return { ok: false, fehler: 'Kunden oder Rechnungen fehlen.' };
    for (const r of obj.rechnungen) {
      if (!r || typeof r.id !== 'string' || !Array.isArray(r.positionen)) return { ok: false, fehler: 'Eine Rechnung ist unvollständig.' };
      for (const p of r.positionen) {
        if (dez(String(p.menge)) === null || dez(String(p.preis)) === null) return { ok: false, fehler: 'Rechnung ' + (r.nummer || r.id) + ' hat eine ungültige Zahl.' };
      }
    }
    return { ok: true, daten: obj };
  }

  /* ---------- Beispieldaten (erfunden) ---------- */
  function beispielDaten() {
    const profil = {
      name: 'Muster Grafik', strasse: 'Beispielweg 12', plz: '12345', ort: 'Musterstadt', land: 'DE',
      steuernummer: '123/456/78901', ustid: '', kontaktName: 'Mia Muster', telefon: '0123 456789',
      email: ['rechnung', 'muster-grafik.example'].join(String.fromCharCode(64)), iban: 'DE02120300000000202051', bic: '', kleinunternehmer: false,
      beispiel: true,
    };
    const kunden = [
      { id: 'bsp-k1', name: 'Erfunden Werkstatt GmbH', strasse: 'Probestraße 5', plz: '54321', ort: 'Beispielhausen', land: 'DE', email: ['einkauf', 'erfunden-werkstatt.example'].join(String.fromCharCode(64)), kaeuferreferenz: 'BESTELLUNG-0815', beispiel: true },
    ];
    const rechnungen = [
      { id: 'bsp-r1', nummer: 'BSP-001', datum: '2026-10-01', faellig: '2026-10-15', leistungVon: '2026-09-01', leistungBis: '2026-09-30', kundeId: 'bsp-k1',
        positionen: [
          { text: 'Gestaltung Faltblatt', menge: '10', einheit: 'HUR', preis: '85.00', satz: '19' },
          { text: 'Fachbuch Typografie', menge: '1', einheit: 'H87', preis: '49.90', satz: '7' },
        ], hinweis: '', status: 'erstellt', beispiel: true },
      { id: 'bsp-r2', nummer: 'BSP-002', datum: '2026-10-08', faellig: '2026-10-22', kundeId: 'bsp-k1',
        positionen: [{ text: 'Logo-Skizzen', menge: '3', einheit: 'H87', preis: '33.33', satz: '0' }],
        hinweis: 'Beispiel für Kleinunternehmer nach § 19 UStG.', status: 'erstellt', beispiel: true },
      { id: 'bsp-r3', nummer: 'BSP-003', datum: '2026-10-20', faellig: '2026-11-03', kundeId: 'bsp-k1',
        positionen: [{ text: 'Druckvorstufe', menge: '1.5', einheit: 'HUR', preis: '12.345', satz: '19' }],
        hinweis: '', status: 'entwurf', beispiel: true },
    ];
    return { profil, kunden, rechnungen };
  }

  return {
    XRECHNUNG_KENNUNG, PROZESS_KENNUNG, GRUND_KLEINUNTERNEHMER, EINHEITEN, EINHEITEN_MEHR, NS, REGELN,
    dez, dezEingabe, plus, minus, mal, geteilt, vergleich, gleich, runde, runde2, text, text2, betragDe, preisDe, zahlDe,
    zeile, berechne,
    parseXml, XmlFehler,
    belegAusDaten, erzeugeCII, dateiname, datumDe, datumIso,
    lese, leseCII, leseUBL,
    pruefe, nachrechnen, ibanGueltig,
    nummerVorschlag, nummerWeiter,
    exportDaten, pruefeImport, beispielDaten,
  };
});
