/*
 * v1.2.1 Task 2: Mini-Markdown-Renderer + renderPageOverride.
 * Der Instanz-Editor liefert Markdown (##, **, *, [x](y), - Listen); der Store
 * kann der Runtime die Felder aber auch bereits als HTML ausliefern – beides
 * muss die App dynamisch korrekt darstellen (fertiges HTML nie wickeln).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "../app/app.js");
const appJsCode = fs.readFileSync(appJsPath, "utf-8");

function baueExp(configData) {
  const sandbox = {
    console, process, require,
    __dirname: path.join(__dirname, "../app"),
    sessionStorage: { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } },
    window: { location: { pathname: "/app/" } },
    document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController,
    configData
  };
  vm.createContext(sandbox);
  vm.runInContext(appJsCode + "\n;globalThis.__e = { vkMarkdownNachHtml, renderPageOverride };", sandbox);
  return sandbox.__e || {};
}

const mdConfig = {
  beschreibung: "## Methodik\nDie App lädt Daten über den **ODAS-Relay**.\n\n- Filter über *Schema-Typen*\n- kein Live-Abruf\n\nMehr Text mit [DZT](https://open-data-germany.org/).\n",
  kontakt: ["Zeile 1\n", "", "Zeile 2 mit <strong>HTML</strong>"],
  impressum: "",
  datenschutz: "### Unterpunkt\nText."
};

const exp = baueExp(mdConfig);

function test() {
  console.log("--- TEST: v1.2.1 Task 2 (Markdown-Renderer + renderPageOverride) ---");
  const md = exp.vkMarkdownNachHtml;
  assert.strictEqual(typeof md, "function", "vkMarkdownNachHtml fehlt");

  assert.strictEqual(md("## Methodik"), "<h3>Methodik</h3>", "## -> h3");
  assert.strictEqual(md("### Unterpunkt"), "<h4>Unterpunkt</h4>", "### -> h4");
  assert.strictEqual(md("# Titel"), "<h3>Titel</h3>", "# -> h3");
  console.log("  [1] Überschriften");

  assert.strictEqual(md("**Fett** und *kursiv*"), "<p><strong>Fett</strong> und <em>kursiv</em></p>", "Fett vor Kursiv");
  assert.strictEqual(md("Ein [Link](https://x.de/) hier"), '<p>Ein <a href="https://x.de/">Link</a> hier</p>', "Markdown-Link");
  console.log("  [2] Inline: Fett/Kursiv/Link");

  assert.strictEqual(md("- Eins\n- Zwei"), "<ul><li>Eins</li><li>Zwei</li></ul>", "Liste als Block");
  assert.strictEqual(md("Absatz A\n\nAbsatz B"), "<p>Absatz A</p><p>Absatz B</p>", "Leerzeile = neuer Absatz");
  assert.strictEqual(md("Text mit <strong>HTML</strong>"), "<p>Text mit <strong>HTML</strong></p>", "vorhandenes Inline-HTML bleibt");
  assert.strictEqual(md(""), "", "leerer Text -> leer");
  console.log("  [3] Listen, Absätze, Inline-HTML-Durchlass");

  const rp = exp.renderPageOverride;
  assert.strictEqual(typeof rp, "function", "renderPageOverride fehlt");
  assert.strictEqual(rp("startseite"), undefined, "startseite -> undefined (App-Standard der Base)");
  assert.strictEqual(rp("unbekannt"), undefined, "unbekannte Seite -> undefined");
  const b = rp("beschreibung");
  assert.ok(b.includes('id="secondarySites"'), "Base-Struktur #secondarySites");
  assert.ok(/<h2 id="vk-i\d+-seitentitel" tabindex="-1">Über diese App<\/h2>/.test(b), "Seitentitel wie Base, als instanzbezogenes Fokusziel");
  assert.ok(b.includes("<h3>Methodik</h3>"), "Markdown gerendert");
  assert.ok(b.includes("<strong>ODAS-Relay</strong>"), "Fett gerendert");
  assert.ok(b.includes('<a href="https://open-data-germany.org/">'), "Link gerendert");
  assert.ok(b.includes("<li>Filter über <em>Schema-Typen</em></li>"), "Liste + Kursiv");
  console.log("  [4] renderPageOverride: Markdown-Beschreibung komplett gerendert");

  const k = rp("kontakt");
  assert.ok(k.includes("Zeile 1") && k.includes("Zeile 2"), "Array-Feld gejoint");
  assert.ok(k.includes("<strong>HTML</strong>"), "HTML im Array bleibt");
  assert.ok(/<h2 id="vk-i\d+-seitentitel" tabindex="-1">Kontakt<\/h2>/.test(k), "Kontakt-Titel als Fokusziel");
  const i = rp("impressum");
  assert.ok(i.includes("Informationen nicht verfügbar"), "leeres Feld -> Base-Fallback-Text");
  assert.ok(rp("datenschutz").includes("<h4>Unterpunkt</h4>"), "Datenschutz mit ### gerendert");
  console.log("  [5] Array/leer/###-Varianten");

  /* Store kann der Runtime fertiges HTML liefern (API zeigt Markdown) –
   * dann unverändert durchreichen, nie in <p> wickeln. */
  const htmlExp = baueExp({
    beschreibung: "<h2>Methodik</h2>\n<p>Text mit <strong>HTML</strong>.</p>",
    kontakt: "", impressum: "", datenschutz: ""
  });
  const hb = htmlExp.renderPageOverride("beschreibung");
  assert.ok(hb.includes("<h2>Methodik</h2>"), "fertiges HTML bleibt HTML");
  assert.ok(!hb.includes("<p><h2>"), "kein HTML in <p> gewickelt");
  assert.ok(!hb.includes("<p></p>"), "keine leeren Wrap-Absätze");
  assert.ok(/<h2 id="vk-i\d+-seitentitel" tabindex="-1">Über diese App<\/h2>/.test(hb), "Base-Struktur mit Fokusziel trotzdem vorhanden");
  console.log("  [6] Runtime-HTML-Variante: unverändert durchgereicht");

  console.log("--- ALLE v1.2.1-TASK-2-TESTS GRÜN ---");
}

test();
