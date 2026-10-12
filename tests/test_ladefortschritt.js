'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../app/app.js'),'utf8');
const config={ort:'Hamburg',radiusKm:'25',apiurls:[{name:'veranstaltungen',url:'https://proxy.opendatagermany.io/api/ts/v1/kg/sparql'}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(){
 const pending=[],updates=[];
 const c=vm.createContext({console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,window:{location:{pathname:'/app/'}},document:{readyState:'complete',addEventListener(){}},fetch:async(url)=>{
 if(String(url).includes('nominatim'))return {ok:true,text:async()=>JSON.stringify([{lat:'53.55',lon:'10'}])};
 const query=new URL(new URL(url,'http://localhost').searchParams.get('path'),'https://dzt.invalid/').searchParams.get('query');
 if(query.includes('con:totalHits'))return {ok:true,text:async()=>JSON.stringify({results:{bindings:[{vkGeoTotal:{value:query.includes('envelope')?'6000':'10852'}}]}})};
 const d=deferred();pending.push(d);return d.promise;
 }});
 vm.runInContext(code+'\nglobalThis.subject={ladeEvents};',c);
 return {c,pending,updates,load:(signal)=>c.subject.ladeEvents(config,signal,{onFortschritt:p=>updates.push(JSON.parse(JSON.stringify(p)))})};
}
const tick=()=>new Promise(r=>setImmediate(r));
const ok=()=>({ok:true,status:200,text:async()=>JSON.stringify({results:{bindings:[]}})});
test('progress counts only completed valid event responses across both time ranges',async()=>{
 const s=setup();const result=s.load();await tick();
 assert.deepEqual(s.updates.map(p=>p.phase),['ort','geo','events']);
 assert.deepEqual(s.updates[2],{phase:'events',erledigt:0,gesamt:4});
 assert.equal(s.pending.length,2);
 s.pending[1].resolve(ok());await tick();assert.equal(s.updates.at(-1).erledigt,1);
 s.pending[0].resolve(ok());await tick();assert.equal(s.updates.at(-1).erledigt,2);
 s.pending[2].resolve(ok());await tick();assert.equal(s.updates.at(-1).erledigt,3);
 s.pending[3].resolve(ok());await result;
 assert.deepEqual(s.updates.filter(p=>p.phase==='events').map(p=>p.erledigt),[0,1,2,3,4]);
});
test('invalid response and later sibling completion do not advance progress',async()=>{
 const s=setup();const result=s.load();await tick();
 s.pending[0].resolve({ok:true,text:async()=>JSON.stringify({invalid:true})});
 await assert.rejects(result,/Antwortformat/);const before=s.updates.length;
 s.pending[1].resolve(ok());await tick();
 assert.equal(s.updates.length,before);
 assert.equal(s.pending.length,2,'no new sibling request after failure');
});

test('simultaneous invalid and valid replies stop further requests',async()=>{
 const s=setup();const result=s.load();await tick();
 s.pending[0].resolve({ok:true,text:async()=>JSON.stringify({invalid:true})});
 s.pending[1].resolve(ok());
 await assert.rejects(result,/Antwortformat/);await tick();
 assert.equal(s.pending.length,2,'no additional request once schema failure is known');
});

test('abort suppresses late progress',async()=>{
 const s=setup(),controller=new AbortController();const result=s.load(controller.signal);await tick();
 controller.abort();const before=s.updates.length;
 s.pending[0].resolve(ok());s.pending[1].resolve(ok());await assert.rejects(result,/Abgebrochen/);
 assert.equal(s.updates.length,before);
});
