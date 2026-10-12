'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../app/app.js'),'utf8');
const config={ort:'Hamburg',radiusKm:'25',apiurls:[{name:'veranstaltungen',url:'https://proxy.opendatagermany.io/api/ts/v1/kg/sparql'}]};
function setup(){const requests=[];const c=vm.createContext({console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,window:{location:{pathname:'/app/'}},document:{readyState:'complete',addEventListener(){}},fetch:async(url)=>{requests.push(String(url));let body;if(String(url).includes('nominatim'))body=[{lat:'53.55',lon:'10'}];else {const q=new URL(new URL(url,'http://localhost').searchParams.get('path'),'http://dzt').searchParams.get('query');body=q.includes('con:totalHits')?{results:{bindings:[{vkGeoTotal:{value:'42'}}]}}:{results:{bindings:[]}};}return {ok:true,status:200,text:async()=>JSON.stringify(body)};}});vm.runInContext(code+'\nglobalThis.load=ladeEvents;',c);return {load:c.load,requests,c};}
test('archive UI coalesces requests and ignores a replaced future snapshot',async()=>{
 const s=setup();let resolve,calls=0;const response=new Promise(r=>resolve=r);
 s.c.stubLoad=()=>{calls++;return response;};
 vm.runInContext('ladeEvents=stubLoad; renderModus=()=>{}; wendeFilterAn=()=>{}; vkPruefeGeteiltenLink=()=>{}; globalThis.archive=vkLadeArchiv;',s.c);
 const source={zukunft:[],archiv:[],archivGeladen:false,heuteKey:'2026-10-12'};
 const state={configdata:config,events:source,status:'bereit',controller:new AbortController(),dom:{}};
 const a=s.c.archive(state),b=s.c.archive(state);assert.equal(calls,1);
 state.events={...source};resolve({archiv:[{id:'stale'}],heuteKey:'2026-10-12'});await Promise.all([a,b]);
 assert.equal(state.events.archiv.length,0,'late archive cannot replace newer results');
});

test('shared archive retry keeps its error indication after a second failure',async()=>{
 const s=setup();s.c.stubLoad=async()=>{throw Error('offline')};
 vm.runInContext('ladeEvents=stubLoad; renderModus=()=>{}; wendeFilterAn=()=>{}; globalThis.archive=vkLadeArchiv;',s.c);
 const state={configdata:config,events:{zukunft:[],archiv:[],archivGeladen:false},status:'bereit',geteiltLaden:true,controller:new AbortController(),dom:{}};
 await s.c.archive(state);assert.equal(state.geteiltFehler,true);
 await s.c.archive(state);assert.equal(state.geteiltFehler,true);
});

test('stale archive miss is rechecked after refresh instead of becoming final not-found',()=>{
 const s=setup();s.c.window.location.search='?event=https%3A%2F%2Fexample.org%2Fevent1';let archives=0;s.c.loadArchive=()=>{archives++};
 vm.runInContext('vkLadeArchiv=loadArchive; globalThis.checkLink=vkPruefeGeteiltenLink;',s.c);
 const state={status:'bereit',aktualisiert:true,events:{zukunft:[],archiv:[],archivGeladen:true}};
 s.c.checkLink(state);assert.ok(!state.geteiltGeprueft);assert.ok(!state.geteiltHinweis);assert.equal(archives,0);
 state.aktualisiert=false;state.events={zukunft:[],archiv:[],archivGeladen:false};s.c.checkLink(state);assert.equal(archives,1);
});

test('future-only startup does not request archive and retains the verified geo plan',async()=>{const s=setup(),progress=[];const data=await s.load(config,undefined,{modus:'zukunft',heuteKey:'2026-10-12',onFortschritt:p=>progress.push(p)});assert.equal(s.requests.length,3);assert.equal(data.archivGeladen,false);assert.equal(data.geoQueries.length,1);assert.equal(progress.at(-1).gesamt,1);assert.equal(progress.at(-1).erledigt,1);assert.ok(!s.requests.some(u=>decodeURIComponent(decodeURIComponent(u)).includes('LIMIT+400')));});
test('on-demand archive reuses center and verified geo plan without geocoding/count requests',async()=>{const s=setup();const source=await s.load(config,undefined,{modus:'zukunft',heuteKey:'2026-10-12'});s.requests.length=0;const data=await s.load(config,undefined,{modus:'archiv',vorlage:source,heuteKey:'2026-10-12'});assert.equal(s.requests.length,1);assert.equal(data.archivGeladen,true);assert.equal(data.zukunft.length,0);assert.equal(data.heuteKey,source.heuteKey);});
