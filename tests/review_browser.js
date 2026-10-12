/* v1.4.4: reale DOM-/AX-/Tastaturregressionen mit synthetischen Daten.
 * Live Server erforderlich; NICHT als Dev-/echte-Geraete-Abnahme ausgeben.
 * node tests/review_browser.js (VK_CHROME, VK_FIXTURE_HOST wie mobile_audit)
 */
const assert = require('assert');
const { mitChrome, FIXTURE_URL, sleep } = require('./mobile_audit');
let checks = 0;
function check(id, pass, details) { checks++; console.log(JSON.stringify({suite:'review', id, pass:!!pass, details})); assert.ok(pass, id); }
async function main() {
  for (const width of [375, 1366]) {
    await mitChrome(width, 812, FIXTURE_URL, null, async sende => {
      const run = async expression => {
        const r = await sende('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result?.value;
      };
      const until = async (expression, ms = 8000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) { if (await run(expression)) return; await sleep(40); }
        throw new Error('Zustand fehlt: '+expression);
      };
      const key = async (name, shift = false) => {
        const code = name === 'Tab' ? 9 : 27;
        for (const type of ['keyDown','keyUp']) await sende('Input.dispatchKeyEvent', {type,key:name,code:name,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,modifiers:shift?8:0});
      };
      const shownScript = "window.__reviewShown=new WeakSet(); document.addEventListener('shown.bs.modal',e=>__reviewShown.add(e.target));";
      await sende('Page.addScriptToEvaluateOnNewDocument',{source:shownScript}); await run(shownScript);
      const ready = "typeof vkInstances !== 'undefined' && Array.from(vkInstances.values())[0]?.status === 'bereit' && document.querySelector('.vk-event-karte')";
      await until(ready);
      const transport = await run(`({preloaded:vkFixtureResult.transportInstalledBeforeApp, unexpected:vkFixtureResult.unexpected,
        realDataRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('nominatim') || r.name.includes('/dzt?') || r.name.includes('proxy.opendatagermany')).map(r=>r.name)})`);
      check('R-preload-'+width, transport.preloaded && !transport.unexpected.length && !transport.realDataRequests.length, transport);

      await run("document.querySelector('[data-vk-art-toggle]').click(); document.querySelector('[data-vk-typ-option=musik]').click(); document.querySelector('[data-vk-typ-option=musik]').focus()");
      const ax = await sende('Accessibility.getFullAXTree');
      const option = ax.nodes.find(n=>!n.ignored && n.role?.value==='button' && n.name?.value.includes('Musik') && n.properties?.some(p=>p.name==='pressed' && p.value.value==='true'));
      check('R-art-AX-'+width, !!option, option && {role:option.role.value,name:option.name.value,pressed:true});
      await key('Escape');
      check('R-art-Escape-'+width, await run("document.activeElement.matches('[data-vk-art-toggle]') && document.querySelector('.vk-art-panel').hidden"));
      await run("document.querySelector('[data-vk-art-toggle]').click(); document.querySelector('.vk-suche').focus(); document.querySelector('.vk-kopf-titel').click()");
      check('R-kein-Fokusdiebstahl-'+width, await run("document.activeElement.matches('.vk-suche') && document.querySelector('.vk-art-panel').hidden"));

      await run(`Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__nativeShare=data}});
        document.querySelector('[data-vk-modus=archiv]').click()`);
      await until("[...vkInstances.values()][0]?.events.archivGeladen === true");
      await run(`window.__archive = Array.from(vkInstances.values())[0].events.archiv.find(e=>e.id==='urn:vk-fixture:heute-musik');
        window.__archiveKey = vkTerminSchluessel(__archive);
        document.querySelector('[data-vk-event="urn:vk-fixture:heute-musik"]').click()`);
      await until("document.querySelector('.modal.show') && __reviewShown.has(document.querySelector('.modal'))");
      const dateInfo = await run(`({expected:plusTage(heutigerTagKey(),-3),date:__archive.startDatum,
        name:document.querySelector('.vk-detail-titel').textContent,
        text:new URL(document.querySelector('a[href^="https://wa.me/"]').href).searchParams.get('text'),key:__archiveKey})`);
      const link = dateInfo.text.match(/https?:\/\/\S+/g).pop();
      check('R-Archiv-Detail-Teilen-'+width, dateInfo.date === dateInfo.expected && dateInfo.name.includes('Archivtermin') && new URL(link).searchParams.get('termin') === dateInfo.key, {date:dateInfo.date,key:dateInfo.key});
      const dialogAx = (await sende('Accessibility.getFullAXTree')).nodes.find(n=>!n.ignored && n.role?.value==='dialog');
      check('R-Dialogname-'+width, dialogAx?.name?.value.includes('Archivtermin'), dialogAx?.name);
      await run("document.querySelector('[data-vk-teilen-native]').click()");
      await until('!!window.__nativeShare');
      check('R-Native-Parameter-'+width, new URL((await run('__nativeShare.text')).match(/https?:\/\/\S+/g).pop()).searchParams.get('termin') === dateInfo.key);

      const point = await run(`(()=>{const b=document.querySelector('[data-vk-teilen-kopieren]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      for (const type of ['mousePressed','mouseReleased']) await sende('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
      await until("document.querySelector('.vk-teilen-status')?.textContent.includes('Link kopiert')");
      const copied = await run('navigator.clipboard.readText()');
      check('R-Archiv-Kopieren-'+width, new URL(copied).searchParams.get('termin') === dateInfo.key);

      const ics = await run(`(async()=>{
        const create=URL.createObjectURL, click=HTMLAnchorElement.prototype.click;
        try {
          URL.createObjectURL=b=>{window.__icsBlob=b; return create.call(URL,b)};
          HTMLAnchorElement.prototype.click=function(){if(!this.download) return click.call(this)};
          document.querySelector('[data-vk-ics]').click(); return await __icsBlob.text();
        } finally {URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click}
      })()`);
      check('R-Archiv-ICS-'+width, ics.includes('DTSTART:'+dateInfo.date.replaceAll('-','')+'T110000') && ics.replace(/\r\n[ \t]/g,'').includes('|'+dateInfo.key+'@odas-veranstaltungskalender'));
      await key('Escape'); await until("!document.querySelector('.modal')");

      await run("window.__bs=bootstrap; window.bootstrap=undefined; document.querySelector('[data-vk-event=\"urn:vk-fixture:heute-musik\"]').click()");
      const fallbackAx = (await sende('Accessibility.getFullAXTree')).nodes.find(n=>!n.ignored && n.role?.value==='dialog');
      check('R-Fallback-AX-'+width, fallbackAx?.name?.value.includes('Archivtermin') && await run("document.activeElement.matches('.btn-close')"));
      await key('Tab', true);
      check('R-Fallback-ShiftTab-'+width, await run(`(()=>{const all=document.querySelector('.modal').querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]');return document.activeElement===all[all.length-1]})()`));
      await key('Tab'); check('R-Fallback-Tab-'+width, await run("document.activeElement.matches('.btn-close')"));
      await key('Escape'); await until("!document.querySelector('.modal')"); await run('window.bootstrap=__bs');

      await sende('Page.navigate',{url:link}); await sleep(100);
      await until("document.querySelector('.vk-detail-titel')?.textContent.includes('Archivtermin')");
      check('R-Termin-Deeplink-'+width, await run("new URL(location.href).searchParams.get('termin') === vkTerminSchluessel(Array.from(vkInstances.values())[0].events.archiv.find(e=>e.id==='urn:vk-fixture:heute-musik'))"));
      await until("__reviewShown.has(document.querySelector('.modal'))"); await key('Escape'); await until("!document.querySelector('.modal')");
      /* Ab hier normale Seitennavigation: kein geteiltes Detail beim Rueckweg erneut anfordern. */
      await run("history.replaceState(history.state,'',location.pathname); document.querySelector('[data-vk-menue]').click()");
      await run("document.querySelector('.vk-drawer a[href=\"#kontakt\"]').click()");
      await until("document.activeElement === document.querySelector('#secondarySites h2') && !!document.activeElement");
      check('R-Seitenfokus-'+width, await run("document.activeElement.textContent === 'Kontakt'"));
      await run("document.querySelector('.vk-zurueck').click()"); await until(ready);
      await until("document.activeElement.matches('.vk-modus-btn[aria-selected=true]')");
      check('R-Rueckkehrfokus-'+width, await run("document.activeElement.matches('.vk-modus-btn[aria-selected=true]')"));

      const rollover = await run(`(()=>{
        const s=Array.from(vkInstances.values())[0];window.__oldController=s.controller;
        const before=vkFixtureResult.requests.filter(u=>u.includes('/dzt?')).length;
        window.__realDate=Date; const tomorrow=plusTage(heutigerTagKey(),1), offset=86400000;
        window.Date=class extends __realDate {constructor(...a){super(...(a.length?a:[__realDate.now()+offset]))} static now(){return __realDate.now()+offset}};
        window.dispatchEvent(new Event('focus'));return {before,tomorrow};
      })()`);
      await until(ready);
      const dayState=await run("({day:Array.from(vkInstances.values())[0].heuteKey,aborted:__oldController.signal.aborted,requests:vkFixtureResult.requests.filter(u=>u.includes('/dzt?')).length})");
      check('R-Tageswechsel-'+width, dayState.day===rollover.tomorrow && dayState.aborted && dayState.requests===rollover.before+2, dayState);
      await run('window.Date=__realDate');

      await run("installVkFixture('empty')"); await until("Array.from(vkInstances.values())[0]?.status === 'bereit'");
      check('R-Cache-isoliert-empty-'+width, await run("document.querySelectorAll('.vk-event-karte').length===0 && document.querySelector('.vk-status-titel')?.textContent.includes('Keine Veranstaltungen')"));
      await run("installVkFixture('error')"); await until("Array.from(vkInstances.values())[0]?.status === 'fehler'");
      check('R-Cache-isoliert-error-'+width, await run("document.querySelector('.vk-status-titel')?.textContent.includes('nicht geladen')"));
      return true;
    }, 0, {port:0, fokusEmulieren:true, clipboardErlauben:true});
  }
  for (const [kind, expression] of [
    ['exception', "setTimeout(()=>{throw new Error('VK_GATE_EXCEPTION')},0)"],
    ['rejection', "Promise.reject(new Error('VK_GATE_REJECTION'))"]
  ]) {
    await assert.rejects(()=>mitChrome(375,812,FIXTURE_URL,null,async sende=>{
      await sende('Runtime.evaluate',{expression});await sleep(80);return true;
    },0,{port:0}), /VK_GATE_(EXCEPTION|REJECTION)/);
    check('R-Fehlergate-'+kind,true,'Absichtliche Negativkontrolle wurde vom Harness abgewiesen');
  }
  /* Auch wenn App-Code einen unbekannten Fetch-Fehler faengt, darf der Fixture-Lauf nicht gruen werden. */
  await assert.rejects(()=>mitChrome(375,812,FIXTURE_URL,null,async sende=>{
    await sende('Runtime.evaluate',{expression:"fetch('/not-allowed').catch(()=>{})",awaitPromise:true});return true;
  },0,{port:0}), /Fixture-Isolation verletzt/);
  check('R-Isolationsgate',true,'Abgefangener unerwarteter Fetch wurde nicht als Erfolg akzeptiert');
  console.log(JSON.stringify({suite:'review',zusammenfassung:{pruefungen:checks,fails:0}}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
