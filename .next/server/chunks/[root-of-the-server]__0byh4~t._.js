module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},97083,e=>{"use strict";var t=e.i(49658),r=e.i(52517),n=e.i(27603),a=e.i(75503),i=e.i(94273),o=e.i(29346),s=e.i(96160),l=e.i(69279),d=e.i(22239),u=e.i(79477),c=e.i(59101),p=e.i(12601),h=e.i(56838),R=e.i(65658),m=e.i(52220),v=e.i(93695);e.i(87473);var x=e.i(91583),g=e.i(69701);e.i(17056);let E=new(e.i(85581)).default({apiKey:process.env.OPENAI_API_KEY});async function f(e){try{console.log("🔥 AI ROUTE HIT");let{note:t,title:r,observation:n,implication:a,recommendation:i,section:o}=await e.json();if(!t||""===t.trim())return g.NextResponse.json({error:"Inspector note is required"},{status:400});let s=(await E.chat.completions.create({model:"gpt-4o",messages:[{role:"system",content:`
You are a SENIOR LICENSED HOME INSPECTOR writing structured, detailed inspection reports.

You MUST ALWAYS return highly structured results.

ABSOLUTE RULES:
- Never write short answers
- Each section must be 4–7 full sentences minimum
- Do NOT mix sections together
- Be extremely descriptive and professional
- Use inspection-report tone

STRUCTURE YOU MUST FOLLOW:

OBSERVATION:
- What is physically seen
- Location, condition, materials
- Visible defects or conditions
- Be factual and detailed

IMPLICATION:
- Why the condition matters
- Risks or potential failure
- Safety or property concerns
- What could happen if ignored

RECOMMENDATION:
- What should be done
- Who should repair it (type of professional)
- Corrective actions
- Best practice guidance

Return ONLY valid JSON.
          `},{role:"user",content:`
Rewrite this inspection finding into a fully structured professional report.

INSPECTOR NOTE:
${t}

CURRENT FINDING:

Title: ${r}
Observation: ${n}
Implication: ${a}
Recommendation: ${i}
Section: ${o}

STRICT OUTPUT RULES:
- Expand each field into 4–7 sentences minimum
- Observation = ONLY physical description
- Implication = ONLY risk + meaning + consequences
- Recommendation = ONLY corrective actions
- Do NOT combine sections
- Do NOT shorten responses

Return ONLY JSON:

{
  "title": "",
  "observation": "",
  "implication": "",
  "recommendation": "",
  "section": ""
}
          `}],temperature:.7})).choices[0].message.content||"";console.log("🤖 RAW AI RESPONSE:",s);let l=function(e){try{return JSON.parse(e)}catch{}let t=e.replace(/```json/g,"").replace(/```/g,"").trim();try{return JSON.parse(t)}catch{}let r=t.match(/\{[\s\S]*\}/);if(r)return JSON.parse(r[0]);throw Error("AI returned invalid JSON")}(s);return console.log("✅ FINAL PARSED RESULT:",l),g.NextResponse.json(l)}catch(e){return console.error("❌ AI ROUTE ERROR:",e),g.NextResponse.json({error:e.message||"Server error"},{status:500})}}e.s(["POST",0,f],12438);var N=e.i(12438);let O=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/ai-adjust-finding/route",pathname:"/api/ai-adjust-finding",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/on-point-inspect-mvp/app/api/ai-adjust-finding/route.ts",nextConfigOutput:"",userland:N,...{}}),{workAsyncStorage:w,workUnitAsyncStorage:y,serverHooks:S}=O;async function T(e,t,n){n.requestMeta&&(0,a.setRequestMeta)(e,n.requestMeta),O.isDev&&(0,a.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let g="/api/ai-adjust-finding/route";g=g.replace(/\/index$/,"")||"/";let E=await O.prepare(e,t,{srcPage:g,multiZoneDraftMode:!1});if(!E)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:f,deploymentId:N,params:w,nextConfig:y,parsedUrl:S,isDraftMode:T,prerenderManifest:A,routerServerContext:C,isOnDemandRevalidate:I,revalidateOnlyGenerated:b,resolvedPathname:P,clientReferenceManifest:U,serverActionsManifest:j}=E,q=(0,s.normalizeAppPath)(g),_=!!(A.dynamicRoutes[q]||A.routes[P]),k=async()=>((null==C?void 0:C.render404)?await C.render404(e,t,S,!1):t.end("This page could not be found"),null);if(_&&!T){let e=!!A.routes[P],t=A.dynamicRoutes[q];if(t&&!1===t.fallback&&!e){if(y.adapterPath)return await k();throw new v.NoFallbackError}}let L=null;!_||O.isDev||T||(L="/index"===(L=P)?"/":L);let M=!0===O.isDev||!_,D=_&&!M;j&&U&&(0,o.setManifestsSingleton)({page:g,clientReferenceManifest:U,serverActionsManifest:j});let H=e.method||"GET",$=(0,i.getTracer)(),B=$.getActiveScopeSpan(),F=!!(null==C?void 0:C.isWrappedByNextServer),W=!!(0,a.getRequestMeta)(e,"minimalMode"),K=(0,a.getRequestMeta)(e,"incrementalCache")||await O.getIncrementalCache(e,y,A,W);null==K||K.resetRequestCache(),globalThis.__incrementalCache=K;let Y={params:w,previewProps:A.preview,renderOpts:{experimental:{authInterrupts:!!y.experimental.authInterrupts},cacheComponents:!!y.cacheComponents,supportsDynamicResponse:M,incrementalCache:K,cacheLifeProfiles:y.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,a)=>O.onRequestError(e,t,n,a,C)},sharedContext:{buildId:f,deploymentId:N}},J=new l.NodeNextRequest(e),V=new l.NodeNextResponse(t),G=d.NextRequestAdapter.fromNodeNextRequest(J,(0,d.signalFromNodeResponse)(t));try{let a,o=async e=>O.handle(G,Y).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=$.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==u.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${H} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t),a&&a!==e&&(a.setAttribute("http.route",n),a.updateName(t))}else e.updateName(`${H} ${g}`)}),s=async a=>{var i,s;let l=async({previousCacheEntry:r})=>{try{if(!W&&I&&b&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await o(a);e.fetchMetrics=Y.renderOpts.fetchMetrics;let s=Y.renderOpts.pendingWaitUntil;s&&n.waitUntil&&(n.waitUntil(s),s=void 0);let l=Y.renderOpts.collectedTags;if(!_)return await (0,p.sendResponse)(J,V,i,Y.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,h.toNodeOutgoingHttpHeaders)(i.headers);l&&(t[m.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==Y.renderOpts.collectedRevalidate&&!(Y.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&Y.renderOpts.collectedRevalidate,n=void 0===Y.renderOpts.collectedExpire||Y.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:Y.renderOpts.collectedExpire;return{value:{kind:x.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await O.onRequestError(e,t,{routerKind:"App Router",routePath:g,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:D,isOnDemandRevalidate:I})},!1,C),t}},d=await O.handleResponse({req:e,nextConfig:y,cacheKey:L,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:A,isRoutePPREnabled:!1,isOnDemandRevalidate:I,revalidateOnlyGenerated:b,responseGenerator:l,waitUntil:n.waitUntil,isMinimalMode:W});if(!_)return null;if((null==d||null==(i=d.value)?void 0:i.kind)!==x.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(s=d.value)?void 0:s.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});W||t.setHeader("x-nextjs-cache",I?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),T&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let u=(0,h.fromNodeOutgoingHttpHeaders)(d.value.headers);return W&&_||u.delete(m.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||u.get("Cache-Control")||u.set("Cache-Control",(0,R.getCacheControlHeader)(d.cacheControl)),await (0,p.sendResponse)(J,V,new Response(d.value.body,{headers:u,status:d.value.status||200})),null};F&&B?await s(B):(a=$.getActiveScopeSpan(),await $.withPropagatedContext(e.headers,()=>$.trace(u.BaseServerSpan.handleRequest,{spanName:`${H} ${g}`,kind:i.SpanKind.SERVER,attributes:{"http.method":H,"http.target":e.url}},s),void 0,!F))}catch(t){if(t instanceof v.NoFallbackError||await O.onRequestError(e,t,{routerKind:"App Router",routePath:q,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:D,isOnDemandRevalidate:I})},!1,C),_)throw t;return await (0,p.sendResponse)(J,V,new Response(null,{status:500})),null}}e.s(["handler",0,T,"patchFetch",0,function(){return(0,n.patchFetch)({workAsyncStorage:w,workUnitAsyncStorage:y})},"routeModule",0,O,"serverHooks",0,S,"workAsyncStorage",0,w,"workUnitAsyncStorage",0,y],97083)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0byh4~t._.js.map