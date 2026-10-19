// Cache is installed atomically. Do not activate a partial offline build.
const CACHE='xueji-shell-2d304f7b6bde';
const ROOT=new URL('./',self.location).href;
const ASSETS=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","assets/index-BxAwQea8.css","assets/index-DlQ6pUFt.js"];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(p=>new URL(p,ROOT).href));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('xueji-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();for(const client of await self.clients.matchAll())client.postMessage('OFFLINE_READY')})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith((async()=>{const hit=await caches.match(event.request);if(hit)return hit;try{return await fetch(event.request)}catch(error){if(event.request.mode==='navigate'){const shell=await caches.match(ROOT+'index.html');if(shell)return shell}throw error}})())});
