/* Deterministische Ladephasen mit lokalem Live Server und Fixture-Transport.
 * Keine echten Dev-/DZT-Daten; keine Aenderung der produktiven Abfragen. */
const assert = require('node:assert/strict');
const { mitChrome, FIXTURE_URL, sleep } = require('./mobile_audit');
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS ' + name); }
(async () => {
  for (const width of [375, 1440]) {
    await mitChrome(width, 812, FIXTURE_URL, null, async send => {
      const run = async expression => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result?.value;
      };
      const until = async expression => {
        const end = Date.now() + 8000;
        while (Date.now() < end) { if (await run(expression)) return; await sleep(30); }
        throw Error('Missing state: ' + expression);
      };
      await until("[...vkInstances.values()][0]?.status === 'bereit'");
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await run(`window.__progressFetch=window.fetch;window.__gates=[];
        window.fetch=(u,init)=>String(u).includes('nominatim')||String(u).includes('/dzt?')
          ?new Promise(resolve=>__gates.push({ok:async()=>{let response=await __progressFetch(u,init);if(String(u).includes('/dzt?')){const q=new URL(new URL(u,location.href).searchParams.get('path'),'http://dzt').searchParams.get('query');if(q.includes('con:totalHits')&&!q.includes('envelope'))response={ok:true,status:200,text:async()=>JSON.stringify({results:{bindings:[{vkGeoTotal:{value:'10852'}}]}})};}resolve(response);},fail:()=>resolve({ok:false,status:500,text:async()=>''})}))
          :__progressFetch(u,init);
        vkDatenCache.clear();localStorage.removeItem(vkCacheSpeicherKey());loadPage('startseite');`);
      await until("__gates.length===1 && !!document.querySelector('.vk-ladebalken')");
      check('Ort indeterminate ' + width, await run("!document.querySelector('.vk-ladebalken').hasAttribute('value') && document.querySelector('.vk-ladephase').textContent.includes('Ort')"));
      check('Responsive ' + width, await run("document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('.vk-ladebalken').getBoundingClientRect().width>100"));
      await run('__gates.shift().ok()');
      await until("__gates.length===1 && document.querySelector('.vk-ladephase').textContent.includes('Suchgebiet')");
      check('Geo indeterminate ' + width, await run("!document.querySelector('.vk-ladebalken').hasAttribute('value')"));
      await run('__gates.shift().ok()');
      // Two extra geo-count requests verify the halves; two future queries follow sequentially.
      await until('__gates.length===1'); await run('__gates.shift().ok()');
      await until('__gates.length===1'); await run('__gates.shift().ok()');
      await until("__gates.length===1 && document.querySelector('.vk-ladebalken').max===2");
      check('0/2 ' + width, await run("document.querySelector('.vk-ladebalken').value===0 && document.querySelector('.vk-ladephase').textContent==='0 von 2 Datenabfragen abgeschlossen'"));
      await run("window.__liveRegion=document.querySelector('.vk-ladephase');__gates.shift().ok()");
      await until("document.querySelector('.vk-ladebalken').value===1");
      check('Persistent live region ' + width, await run("document.querySelector('.vk-ladephase')===__liveRegion && __liveRegion.textContent==='1 von 2 Datenabfragen abgeschlossen' && __liveRegion.getAttribute('aria-live')==='polite'"));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(), `vk-ladefortschritt-${width}.png`), Buffer.from(shot.data, 'base64'));
      const ax = await send('Accessibility.getFullAXTree');
      check('Accessible progress ' + width, ax.nodes.some(n => !n.ignored && n.role?.value === 'progressbar' && n.name?.value === 'Fortschritt der Datenabfragen' && n.value?.value === 1));
      await run("document.querySelector('[data-vk-modus=katalog]').click()");
      check('Mode retains progress ' + width, await run("document.querySelector('.vk-ladebalken').value===1"));
      await run('__gates.shift().ok()');
      await until("[...vkInstances.values()][0]?.status==='bereit'");
      check('Success removes bar ' + width, await run("!document.querySelector('.vk-ladebalken') && document.querySelectorAll('[data-vk-event]').length>0"));
      await run("loadPage('beschreibung')");
      await run("loadPage('startseite')");
      await until("[...vkInstances.values()][0]?.status==='bereit'");
      check('Cache skips reload ' + width, await run("__gates.length===0 && !document.querySelector('.vk-ladebalken')"));
      await run("vkDatenCache.clear();localStorage.removeItem(vkCacheSpeicherKey());loadPage('startseite')");
      await until('__gates.length===1'); await run('__gates.shift().ok()');
      await until('__gates.length===1'); await run('__gates.shift().ok()');
      await until('__gates.length===1'); await run('__gates.shift().ok()');
      await until('__gates.length===1'); await run('__gates.shift().ok()');
      await until('__gates.length===1'); await run('__gates.shift().fail()');
      await until("[...vkInstances.values()][0]?.status==='fehler'");
      check('Error not overwritten ' + width, await run("!document.querySelector('.vk-ladebalken') && document.querySelector('.vk-status-titel').textContent.includes('nicht geladen')"));
      await run("loadPage('startseite')"); await until('__gates.length===1');
      await run("(async()=>{window.__leftController=[...vkInstances.values()][0].controller;await loadPage('beschreibung');__gates.shift().ok()})()");
      check('Leave suppresses late progress ' + width, await run("!document.querySelector('.vk-ladebalken') && __leftController.signal.aborted && document.body.classList.contains('vk-sekundaer')"));
      await run('window.fetch=__progressFetch');
    }, 0, { port: 0 });
  }
  console.log('PASS ' + checks + ' browser checks (fixtures, reduced motion, 375/1440px)');
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
