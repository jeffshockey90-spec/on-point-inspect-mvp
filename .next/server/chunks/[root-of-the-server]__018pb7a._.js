module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},24202,e=>{"use strict";var t=e.i(49658),r=e.i(52517),n=e.i(27603),a=e.i(75503),o=e.i(94273),i=e.i(29346),s=e.i(96160),l=e.i(69279),p=e.i(22239),d=e.i(79477),u=e.i(59101),c=e.i(12601),h=e.i(56838),m=e.i(65658),f=e.i(52220),v=e.i(93695);e.i(87473);var y=e.i(91583),g=e.i(69701);async function R(e){try{let{emailType:t,clientName:r,propertyAddress:n,inspectionDate:a,inspectionTime:o,reportLink:i,inspectorName:s="Jeff Shockey",companyName:l="On Point Home Inspections",phone:p="240-527-7172",website:d="https://onpointhomeinspect.com"}=await e.json();if(!t)return g.NextResponse.json({error:"Missing emailType"},{status:400});let u=r||"there",c=n||"the property",h="",m="";switch(t){case"inspection_confirmation":h=`Inspection Confirmed - ${c}`,m=`Hi ${u},

Your home inspection for ${c} has been confirmed.

Inspection Date: ${a||"Scheduled date"}
Inspection Time: ${o||"Scheduled time"}

Please make sure the inspection agreement is signed and payment is completed prior to the inspection.

I look forward to meeting you and helping you better understand the condition of the home.

Thank you,

${s}
${l}
${p}
${d}`;break;case"agreement_reminder":h=`Inspection Agreement Reminder - ${c}`,m=`Hi ${u},

This is a friendly reminder to please review and sign your inspection agreement prior to the inspection for ${c}.

The agreement must be completed before the inspection can take place.

Please let me know if you have any questions.

Thank you,

${s}
${l}
${p}
${d}`;break;case"payment_reminder":h=`Inspection Payment Reminder - ${c}`,m=`Hi ${u},

This is a friendly reminder that payment is due prior to the inspection for ${c}.

Once payment and the signed agreement are completed, everything will be ready for your scheduled inspection.

Please let me know if you have any questions.

Thank you,

${s}
${l}
${p}
${d}`;break;case"report_published":h=`Your Home Inspection Report Is Ready - ${c}`,m=`Hi ${u},

Your home inspection report for ${c} has been completed and is ready to view.

You can view your report here:
${i||"[REPORT LINK]"}

While viewing your report, please remember the purpose of a home inspection is to identify visible defects and potential concerns at the time of the inspection. The inspection is intended to provide information about the current condition of the home and should not be interpreted as a pass or fail evaluation of the property.

Please let me know if you have any questions.

Thank you,

${s}
${l}
${p}
${d}`;break;case"review_request":h=`Thank You For Choosing ${l}`,m=`Hi ${u},

Thank you again for choosing ${l} for your home inspection at ${c}.

If you were happy with the inspection and report, I would greatly appreciate a Google review. Reviews help small local businesses like mine grow and help future clients feel confident when choosing an inspector.

You can leave a review here:
[GOOGLE REVIEW LINK]

Thank you again,

${s}
${l}
${p}
${d}`;break;default:return g.NextResponse.json({error:"Invalid emailType"},{status:400})}return g.NextResponse.json({subject:h,message:m})}catch(e){return console.error("Email template error:",e),g.NextResponse.json({error:"Failed to generate email template"},{status:500})}}e.s(["POST",0,R],86951);var x=e.i(86951);let w=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/email-template/route",pathname:"/api/email-template",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/on-point-inspect-mvp/app/api/email-template/route.ts",nextConfigOutput:"",userland:x,...{}}),{workAsyncStorage:$,workUnitAsyncStorage:b,serverHooks:E}=w;async function k(e,t,n){n.requestMeta&&(0,a.setRequestMeta)(e,n.requestMeta),w.isDev&&(0,a.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let g="/api/email-template/route";g=g.replace(/\/index$/,"")||"/";let R=await w.prepare(e,t,{srcPage:g,multiZoneDraftMode:!1});if(!R)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:x,deploymentId:$,params:b,nextConfig:E,parsedUrl:k,isDraftMode:T,prerenderManifest:C,routerServerContext:A,isOnDemandRevalidate:P,revalidateOnlyGenerated:I,resolvedPathname:N,clientReferenceManifest:q,serverActionsManifest:O}=R,_=(0,s.normalizeAppPath)(g),S=!!(C.dynamicRoutes[_]||C.routes[N]),H=async()=>((null==A?void 0:A.render404)?await A.render404(e,t,k,!1):t.end("This page could not be found"),null);if(S&&!T){let e=!!C.routes[N],t=C.dynamicRoutes[_];if(t&&!1===t.fallback&&!e){if(E.adapterPath)return await H();throw new v.NoFallbackError}}let j=null;!S||w.isDev||T||(j="/index"===(j=N)?"/":j);let M=!0===w.isDev||!S,U=S&&!M;O&&q&&(0,i.setManifestsSingleton)({page:g,clientReferenceManifest:q,serverActionsManifest:O});let D=e.method||"GET",F=(0,o.getTracer)(),K=F.getActiveScopeSpan(),L=!!(null==A?void 0:A.isWrappedByNextServer),B=!!(0,a.getRequestMeta)(e,"minimalMode"),G=(0,a.getRequestMeta)(e,"incrementalCache")||await w.getIncrementalCache(e,E,C,B);null==G||G.resetRequestCache(),globalThis.__incrementalCache=G;let Y={params:b,previewProps:C.preview,renderOpts:{experimental:{authInterrupts:!!E.experimental.authInterrupts},cacheComponents:!!E.cacheComponents,supportsDynamicResponse:M,incrementalCache:G,cacheLifeProfiles:E.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,a)=>w.onRequestError(e,t,n,a,A)},sharedContext:{buildId:x,deploymentId:$}},W=new l.NodeNextRequest(e),V=new l.NodeNextResponse(t),X=p.NextRequestAdapter.fromNodeNextRequest(W,(0,p.signalFromNodeResponse)(t));try{let a,i=async e=>w.handle(X,Y).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=F.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${D} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t),a&&a!==e&&(a.setAttribute("http.route",n),a.updateName(t))}else e.updateName(`${D} ${g}`)}),s=async a=>{var o,s;let l=async({previousCacheEntry:r})=>{try{if(!B&&P&&I&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let o=await i(a);e.fetchMetrics=Y.renderOpts.fetchMetrics;let s=Y.renderOpts.pendingWaitUntil;s&&n.waitUntil&&(n.waitUntil(s),s=void 0);let l=Y.renderOpts.collectedTags;if(!S)return await (0,c.sendResponse)(W,V,o,Y.renderOpts.pendingWaitUntil),null;{let e=await o.blob(),t=(0,h.toNodeOutgoingHttpHeaders)(o.headers);l&&(t[f.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==Y.renderOpts.collectedRevalidate&&!(Y.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&Y.renderOpts.collectedRevalidate,n=void 0===Y.renderOpts.collectedExpire||Y.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:Y.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:o.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await w.onRequestError(e,t,{routerKind:"App Router",routePath:g,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:P})},!1,A),t}},p=await w.handleResponse({req:e,nextConfig:E,cacheKey:j,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:C,isRoutePPREnabled:!1,isOnDemandRevalidate:P,revalidateOnlyGenerated:I,responseGenerator:l,waitUntil:n.waitUntil,isMinimalMode:B});if(!S)return null;if((null==p||null==(o=p.value)?void 0:o.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==p||null==(s=p.value)?void 0:s.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});B||t.setHeader("x-nextjs-cache",P?"REVALIDATED":p.isMiss?"MISS":p.isStale?"STALE":"HIT"),T&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let d=(0,h.fromNodeOutgoingHttpHeaders)(p.value.headers);return B&&S||d.delete(f.NEXT_CACHE_TAGS_HEADER),!p.cacheControl||t.getHeader("Cache-Control")||d.get("Cache-Control")||d.set("Cache-Control",(0,m.getCacheControlHeader)(p.cacheControl)),await (0,c.sendResponse)(W,V,new Response(p.value.body,{headers:d,status:p.value.status||200})),null};L&&K?await s(K):(a=F.getActiveScopeSpan(),await F.withPropagatedContext(e.headers,()=>F.trace(d.BaseServerSpan.handleRequest,{spanName:`${D} ${g}`,kind:o.SpanKind.SERVER,attributes:{"http.method":D,"http.target":e.url}},s),void 0,!L))}catch(t){if(t instanceof v.NoFallbackError||await w.onRequestError(e,t,{routerKind:"App Router",routePath:_,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:P})},!1,A),S)throw t;return await (0,c.sendResponse)(W,V,new Response(null,{status:500})),null}}e.s(["handler",0,k,"patchFetch",0,function(){return(0,n.patchFetch)({workAsyncStorage:$,workUnitAsyncStorage:b})},"routeModule",0,w,"serverHooks",0,E,"workAsyncStorage",0,$,"workUnitAsyncStorage",0,b],24202)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__018pb7a._.js.map