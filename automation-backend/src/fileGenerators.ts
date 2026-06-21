import { componentBaseFromSlug, RUBIK_REPO, AURUM_REPO, RUBIK_VERCEL_JSON, AURUM_APP_TSX } from "./pathSecurity.ts";
import { resolveProductionScore } from "./productionScore.ts";
import { sanitizeSlug } from "./security.ts";
import { CLIENT_FACING_DOMAIN, INTERNAL_ENGINE_DOMAIN, SERVICE_VERSION } from "./schemas.ts";

function j(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function safeText(value: unknown, fallback = ""): string {
  return String(value ?? fallback)
    .replace(/<script/gi, "&lt;script")
    .replace(/<\/script/gi, "&lt;/script");
}

function safeUrl(value: unknown): string {
  const s = String(value ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

function resolveMediaUrl(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const url = (value as Record<string, unknown>).url;
    return safeUrl(url);
  }
  return safeUrl(value);
}

function resolvePropertyImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) return resolveMediaUrl(item);
    return safeUrl(item);
  }).filter(Boolean);
}

function toCamelBase(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  if (!parts.length) return "";
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GeneratedFile {
  repo: string;
  path: string;
  content: string;
  message: string;
  encoding: "utf8";
  isPatchTarget?: boolean;
  patchType?: string;
}

export interface GeneratorResult {
  files: GeneratedFile[];
  warnings: string[];
  errors: string[];
  assetMode: "client_real_asset" | "fallback_internal_library" | "mixed";
}

// ─── Asset mode ───────────────────────────────────────────────────────────────

function detectAssetMode(assets: Record<string, unknown>): GeneratorResult["assetMode"] {
  const logo = resolveMediaUrl(assets.logo);
  const hero = resolveMediaUrl(assets.heroImage);
  const images = resolvePropertyImages(assets.propertyImages);
  if (logo && hero && images.length >= 2) return "client_real_asset";
  if (!logo && !hero && !images.length) return "fallback_internal_library";
  return "mixed";
}

// ─── RUBIK generators ─────────────────────────────────────────────────────────

export function buildRubikFiles(payload: Record<string, unknown>): GeneratorResult {
  const slug = sanitizeSlug(String((payload?.lead as Record<string, unknown>)?.slug ?? ""));
  const lead = (payload.lead || {}) as Record<string, unknown>;
  const assets = (payload.mediaAssets || {}) as Record<string, unknown>;
  const contact = (payload.contact || {}) as Record<string, unknown>;

  const clientName = safeText(lead.name, slug);
  const claim = safeText((payload as Record<string, unknown>).opportunityDetected ?? lead.claim ?? "Experiencia inmobiliaria premium");
  const logoUrl = resolveMediaUrl(assets.logo);
  const heroImage = resolveMediaUrl(assets.heroImage);
  const propertyImages = resolvePropertyImages(assets.propertyImages);
  const primaryColor = safeText(lead.primaryColor ?? "#1a1a2e", "#1a1a2e");
  const accentColor = safeText(lead.accentColor ?? "#d4af37", "#d4af37");
  const waPhone = String(contact.whatsapp ?? "").replace(/\D/g, "");
  const waHref = waPhone
    ? `https://wa.me/${waPhone}?text=Hola,%20me%20interesa%20una%20propuesta%20premium%20de%20${encodeURIComponent(clientName)}`
    : "#contact";
  const website = safeUrl(lead.website ?? "");

  const assetMode = detectAssetMode(assets);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!slug) { errors.push("rubik:slug_required"); return { files: [], warnings, errors, assetMode }; }
  if (!logoUrl) warnings.push("rubik:no_logo_url_using_svg_placeholder");
  if (!heroImage) warnings.push("rubik:no_hero_image");
  if (!propertyImages.length) warnings.push("rubik:no_property_images");

  return {
    files: [
      {
        repo: RUBIK_REPO,
        path: `gesture-lab/${slug}-v1.html`,
        content: buildGestureLabHtml({ clientName, slug, logoUrl, propertyImages, heroImage, primaryColor, accentColor, waHref, website, claim }),
        message: `feat(gesture-lab): add ${clientName} visual experience v1`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: `dynamic-motion-banner/${slug}/config.js`,
        content: buildBannerConfig({ clientName, slug, logoUrl, heroImage, primaryColor, accentColor, waHref, claim }),
        message: `feat(banners): add ${clientName} banner config`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: `dynamic-motion-banner/${slug}/banner-engine.js`,
        content: buildBannerEngine(),
        message: `feat(banners): add ${clientName} banner engine adapter`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: `dynamic-motion-banner/${slug}/banner-pack/index.html`,
        content: buildBannerPackHtml({ clientName, slug, accentColor }),
        message: `feat(banners): add ${clientName} banner pack`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: `dynamic-motion-banner/${slug}/banner-vertical.html`,
        content: buildBannerHtml({ orientation: "vertical", clientName, slug, logoUrl, heroImage, primaryColor, accentColor, waHref, claim }),
        message: `feat(banners): add ${clientName} vertical banner`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: `dynamic-motion-banner/${slug}/banner-horizontal.html`,
        content: buildBannerHtml({ orientation: "horizontal", clientName, slug, logoUrl, heroImage, primaryColor, accentColor, waHref, claim }),
        message: `feat(banners): add ${clientName} horizontal banner`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: `dynamic-motion-banner/${slug}/assets/logo.svg`,
        content: buildLogoSvg(clientName, accentColor),
        message: `feat(banners): add ${clientName} logo SVG placeholder`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: `production-manifests/${slug}.json`,
        content: j({
          slug, clientName,
          generatedBy: `immersphere-production-orchestrator-v${SERVICE_VERSION}`,
          assetMode,
          files: [
            `gesture-lab/${slug}-v1.html`,
            `dynamic-motion-banner/${slug}/banner-pack/index.html`,
            `dynamic-motion-banner/${slug}/banner-vertical.html`,
            `dynamic-motion-banner/${slug}/banner-horizontal.html`,
          ],
        }),
        message: `feat(manifests): add ${clientName} Rubik production manifest`,
        encoding: "utf8",
      },
      {
        repo: RUBIK_REPO,
        path: RUBIK_VERCEL_JSON,
        content: j(buildVercelJsonPatch(slug)),
        message: `feat(routing): add ${clientName} vercel rewrites`,
        encoding: "utf8",
        isPatchTarget: true,
        patchType: "vercel-json-rewrites",
      },
    ],
    warnings,
    errors,
    assetMode,
  };
}

// ─── AURUM generators ─────────────────────────────────────────────────────────

export function buildAurumFiles(payload: Record<string, unknown>, proposalPackage?: Record<string, unknown>): GeneratorResult {
  const slug = sanitizeSlug(String((payload?.lead as Record<string, unknown>)?.slug ?? ""));
  const lead = (payload.lead || {}) as Record<string, unknown>;
  const assets = (payload.mediaAssets || {}) as Record<string, unknown>;
  const contact = (payload.contact || {}) as Record<string, unknown>;

  const componentBase = componentBaseFromSlug(slug);
  const camelBase = toCamelBase(slug);
  const clientName = safeText(lead.name, slug);
  const sector = safeText(lead.sector ?? "Inmobiliario");
  const zone = safeText(lead.zone ?? "España");
  const website = safeUrl(lead.website ?? "");
  const logoUrl = resolveMediaUrl(assets.logo);
  const heroImage = resolveMediaUrl(assets.heroImage);
  const propertyImages = resolvePropertyImages(assets.propertyImages);
  const videoUrl = Array.isArray(assets.videos) && assets.videos.length > 0 ? resolveMediaUrl(assets.videos[0]) : "";
  const primaryColor = safeText(lead.primaryColor ?? "#1a1a2e", "#1a1a2e");
  const accentColor = safeText(lead.accentColor ?? "#d4af37", "#d4af37");
  const waPhone = String(contact.whatsapp ?? "").replace(/\D/g, "");
  const waHref = waPhone
    ? `https://wa.me/${waPhone}?text=Hola,%20solicito%20propuesta%20premium%20de%20${encodeURIComponent(clientName)}`
    : "#contact";
  const telHref = contact.phone ? `tel:${String(contact.phone).replace(/\s/g, "")}` : "#contact";
  const emailHref = contact.email ? `mailto:${contact.email}` : "#contact";
  const claim = safeText((payload as Record<string, unknown>).opportunityDetected ?? lead.claim ?? "Experiencia inmobiliaria premium");

  const assetMode = detectAssetMode(assets);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!slug) { errors.push("aurum:slug_required"); return { files: [], warnings, errors, assetMode }; }
  if (!componentBase) { errors.push("aurum:component_base_empty"); return { files: [], warnings, errors, assetMode }; }
  if (!logoUrl) warnings.push("aurum:no_logo_url");
  if (!heroImage) warnings.push("aurum:no_hero_image");
  if (!waPhone) warnings.push("aurum:no_whatsapp");

  const digitalPresenceScore = resolveProductionScore(payload as Record<string, unknown>);

  return {
    files: [
      {
        repo: AURUM_REPO,
        path: `src/data/clientDemos/${camelBase}.ts`,
        content: buildClientDemoData({ slug, camelBase, componentBase, clientName, sector, zone, website, logoUrl, heroImage, propertyImages, videoUrl, primaryColor, accentColor, waHref, telHref, emailHref, claim, digitalPresenceScore }),
        message: `feat(data): add ${clientName} client demo data`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/${componentBase}Landing.tsx`,
        content: buildLandingComponent({ slug, componentBase, camelBase, clientName, heroImage, logoUrl, claim, waHref, accentColor }),
        message: `feat(landing): add ${clientName} landing page`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/${componentBase}WebCompleta.tsx`,
        content: buildWebCompletaComponent({ slug, componentBase, camelBase, clientName }),
        message: `feat(web-completa): add ${clientName} web completa`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/${componentBase}VisualExperience.tsx`,
        content: buildIframeWrapper({ slug, componentBase, type: "visual-experience" }),
        message: `feat(visual-experience): add ${clientName} visual experience wrapper`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/${componentBase}BannerPack.tsx`,
        content: buildIframeWrapper({ slug, componentBase, type: "banner-pack" }),
        message: `feat(banners): add ${clientName} banner pack wrapper`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/${componentBase}BannerVertical.tsx`,
        content: buildIframeWrapper({ slug, componentBase, type: "banner-vertical" }),
        message: `feat(banners): add ${clientName} banner vertical wrapper`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/${componentBase}BannerHorizontal.tsx`,
        content: buildIframeWrapper({ slug, componentBase, type: "banner-horizontal" }),
        message: `feat(banners): add ${clientName} banner horizontal wrapper`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: AURUM_APP_TSX,
        content: j(buildAppTsxPatch({ slug, componentBase })),
        message: `feat(routing): add ${clientName} routes to App.tsx`,
        encoding: "utf8",
        isPatchTarget: true,
        patchType: "app-tsx-routes",
      },
      {
        repo: AURUM_REPO,
        path: `production-manifests/${slug}.json`,
        content: j({
          slug, clientName, componentBase, camelBase,
          generatedBy: `immersphere-production-orchestrator-v${SERVICE_VERSION}`,
          assetMode,
          routes: {
            landing: `/${slug}`,
            webCompleta: `/${slug}-web-completa`,
            visualExperience: `/visual-experience/${slug}`,
            bannerPack: `/banners/${slug}`,
            bannerVertical: `/banners/${slug}/vertical`,
            bannerHorizontal: `/banners/${slug}/horizontal`,
          },
        }),
        message: `feat(manifests): add ${clientName} AURUM production manifest`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/generated/${componentBase}ProductionPlan.ts`,
        content: `// Auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}\nexport const productionPlan = { slug: ${JSON.stringify(slug)}, componentBase: ${JSON.stringify(componentBase)}, camelBase: ${JSON.stringify(camelBase)}, status: "review_required" } as const;\n`,
        message: `feat(generated): add ${clientName} production plan`,
        encoding: "utf8",
      },
      {
        repo: AURUM_REPO,
        path: `src/generated/${componentBase}ProposalPackage.ts`,
        content: `// Auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}\nexport const proposalPackage = ${JSON.stringify(proposalPackage || { slug, clientName, status: "review_required" }, null, 2)} as const;\n`,
        message: `feat(generated): add ${clientName} proposal package`,
        encoding: "utf8",
      },
    ],
    warnings,
    errors,
    assetMode,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateGeneratedFiles(files: GeneratedFile[]): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    if (!file.repo || !file.path || !file.message) {
      errors.push(`missing_required_fields:${file.path || "unknown"}`);
      continue;
    }
    if (!file.content && !file.isPatchTarget) {
      errors.push(`empty_content:${file.path}`);
    }
    if (file.content && file.content.length > 500_000) {
      errors.push(`content_too_large:${file.path}`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ─── Rubik HTML builders ──────────────────────────────────────────────────────

function buildGestureLabHtml({ clientName, slug, logoUrl, propertyImages, heroImage, primaryColor, accentColor, waHref, website, claim }) {
  const allImages = [heroImage, ...propertyImages].filter(Boolean).slice(0, 8);
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(clientName)} — Visual Experience</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;overflow:hidden;font-family:'Arial',sans-serif;width:100vw;height:100vh}
    #cv{position:fixed;inset:0;width:100%;height:100%;z-index:0}
    .ov{position:fixed;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.35) 0,rgba(0,0,0,.1) 40%,rgba(0,0,0,.7) 100%);z-index:1}
    .ui{position:fixed;inset:0;z-index:2;display:flex;flex-direction:column;justify-content:space-between;padding:40px 48px}
    .logo img{max-height:56px;filter:brightness(0) invert(1)}
    .logo .txt{color:#fff;font-size:22px;font-weight:700;letter-spacing:.06em;display:none}
    .mid{text-align:center}
    .ey{color:${safeText(accentColor)};font-size:12px;letter-spacing:.22em;text-transform:uppercase;margin-bottom:16px}
    h1{color:#fff;font-size:clamp(36px,7vw,80px);line-height:1;font-weight:800;text-shadow:0 2px 24px rgba(0,0,0,.5)}
    .cl{color:rgba(255,255,255,.85);font-size:clamp(16px,2.5vw,22px);margin-top:18px;max-width:700px;margin-inline:auto}
    .bot{display:flex;justify-content:space-between;align-items:flex-end}
    .thumbs{display:flex;gap:8px}
    .th{width:80px;height:56px;object-fit:cover;border-radius:4px;opacity:.55;cursor:pointer;border:2px solid transparent;transition:.25s}
    .th.on,.th:hover{opacity:1;border-color:${safeText(accentColor)}}
    .btn{display:inline-flex;align-items:center;gap:10px;background:${safeText(accentColor)};color:#000;font-weight:700;font-size:15px;padding:14px 28px;border-radius:2px;text-decoration:none;letter-spacing:.04em;transition:opacity .2s}
    .btn:hover{opacity:.88}
    .web{color:rgba(255,255,255,.5);font-size:12px;text-decoration:none;display:block;margin-top:6px;text-align:right}
    .web:hover{color:#fff}
  </style>
</head>
<body>
  <canvas id="cv"></canvas>
  <div class="ov"></div>
  <div class="ui">
    <div class="logo">
      ${logoUrl ? `<img src="${safeText(logoUrl)}" alt="${safeText(clientName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="txt">${safeText(clientName)}</span>` : `<span class="txt" style="display:block">${safeText(clientName)}</span>`}
    </div>
    <div class="mid">
      <div class="ey">Experiencia Inmobiliaria Premium</div>
      <h1>${safeText(clientName)}</h1>
      <p class="cl">${safeText(claim)}</p>
    </div>
    <div class="bot">
      <div class="thumbs" id="th"></div>
      <div>
        <a class="btn" href="${safeText(waHref)}" target="_blank" rel="noopener">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.95 11.95 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.59 5.97L0 24l6.2-1.57A11.96 11.96 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.22-3.48-8.52zM12 22c-1.85 0-3.66-.5-5.25-1.43l-.38-.22-3.68.93.97-3.59-.25-.38A9.94 9.94 0 0 1 2 12c0-5.52 4.48-10 10-10s10 4.48 10 10-4.48 10-10 10zm5.44-7.43c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07a8.14 8.14 0 0 1-2.38-1.47 8.9 8.9 0 0 1-1.65-2.06c-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.27.49 1.7.63.71.22 1.36.19 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"/></svg>
          Solicitar Propuesta Premium
        </a>
        ${website ? `<a class="web" href="${safeText(website)}" target="_blank" rel="noopener">${safeText(website.replace(/^https?:\/\//, ""))}</a>` : ""}
      </div>
    </div>
  </div>
  <script>
  (function(){
    var IMGS=${JSON.stringify(allImages)},BG="#0a0a0a",cv=document.getElementById("cv"),ctx=cv.getContext("2d"),cur=0,imgs=[],loaded=0,aid,t0,DUR=6000,TRANS=900;
    function resize(){cv.width=innerWidth;cv.height=innerHeight;}
    addEventListener("resize",resize);resize();
    function draw(img,p){
      var cw=cv.width,ch=cv.height,sc=1+.06*p,iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
      var r=Math.max(cw/iw,ch/ih)*sc,dw=iw*r,dh=ih*r,ox=(cw-dw)/2*(1-p*.04),oy=(ch-dh)/2*(1-p*.04);
      ctx.clearRect(0,0,cw,ch);ctx.fillStyle=BG;ctx.fillRect(0,0,cw,ch);ctx.drawImage(img,ox,oy,dw,dh);
    }
    function tick(ts){
      if(!t0)t0=ts;var p=Math.min((ts-t0)/DUR,1);
      if(imgs[cur])draw(imgs[cur],p);
      if(p>=1){t0=null;cur=(cur+1)%imgs.length;mark();}
      aid=requestAnimationFrame(tick);
    }
    function mark(){document.querySelectorAll(".th").forEach(function(el,i){el.classList.toggle("on",i===cur);});}
    var tc=document.getElementById("th");
    IMGS.slice(0,5).forEach(function(src,i){
      var t=document.createElement("img");t.className="th"+(i===0?" on":"");t.src=src;t.alt="";
      t.onclick=function(){cur=i;t0=null;mark();};tc.appendChild(t);
    });
    if(!IMGS.length){document.body.style.background=BG;return;}
    IMGS.forEach(function(src,i){
      var img=new Image();img.crossOrigin="anonymous";
      img.onload=function(){imgs[i]=img;if(!loaded++)aid=requestAnimationFrame(tick);};
      img.onerror=function(){if(!loaded++)aid=requestAnimationFrame(tick);};
      img.src=src;
    });
  })();
  </script>
</body>
</html>
`;
}

function buildBannerConfig({ clientName, slug, logoUrl, heroImage, primaryColor, accentColor, waHref, claim }) {
  return `// Banner config for ${safeText(clientName)} — auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}
window.BANNER_CONFIG = {
  clientName: ${JSON.stringify(clientName)},
  slug: ${JSON.stringify(slug)},
  claim: ${JSON.stringify(claim)},
  logoUrl: ${JSON.stringify(logoUrl || "")},
  heroImage: ${JSON.stringify(heroImage || "")},
  primaryColor: ${JSON.stringify(primaryColor)},
  accentColor: ${JSON.stringify(accentColor)},
  waHref: ${JSON.stringify(waHref)},
};
`;
}

function buildBannerEngine(): string {
  return `// Stable banner engine adapter — immersphere v${SERVICE_VERSION}
(function(){
  var cfg=window.BANNER_CONFIG||{};
  function apply(){
    var n=document.querySelector("[data-b-name]"),cl=document.querySelector("[data-b-claim]"),
        lo=document.querySelector("[data-b-logo]"),he=document.querySelector("[data-b-hero]"),
        ct=document.querySelector("[data-b-cta]");
    if(n)n.textContent=cfg.clientName||"";
    if(cl)cl.textContent=cfg.claim||"";
    if(lo&&cfg.logoUrl){lo.src=cfg.logoUrl;lo.style.display="";}
    if(he&&cfg.heroImage){he.src=cfg.heroImage;he.style.display="";}
    if(ct&&cfg.waHref)ct.href=cfg.waHref;
  }
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",apply):apply();
})();
`;
}

function buildBannerHtml({ orientation, clientName, slug, logoUrl, heroImage, primaryColor, accentColor, waHref, claim }) {
  const isV = orientation === "vertical";
  const w = isV ? 400 : 728;
  const h = isV ? 700 : 90;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${safeText(clientName)} — Banner ${orientation}</title>
  <script src="../config.js"></script>
  <script src="../banner-engine.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${w}px;height:${h}px;overflow:hidden;font-family:Arial,sans-serif;background:${safeText(primaryColor)}}
    .wrap{width:100%;height:100%;position:relative;display:flex;${isV ? "flex-direction:column;justify-content:space-between;padding:24px 20px;" : "align-items:center;padding:0 16px;gap:12px;"}}
    .hero{position:absolute;inset:0;z-index:0}
    .hero img{width:100%;height:100%;object-fit:cover;opacity:.42}
    .cnt{position:relative;z-index:1;${isV ? "" : "display:flex;align-items:center;gap:12px;flex:1;min-width:0;"}}
    ${isV ? `.lw img{max-height:36px;filter:brightness(0) invert(1)} h2{color:#fff;font-size:22px;margin-top:12px} p{color:rgba(255,255,255,.8);font-size:13px;margin-top:8px;max-width:320px}` : `h2{color:#fff;font-size:14px;white-space:nowrap;flex-shrink:0} p{color:rgba(255,255,255,.7);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}`}
    .cta{display:inline-block;background:${safeText(accentColor)};color:#000;font-weight:700;font-size:${isV ? 14 : 12}px;padding:${isV ? "12px 20px" : "6px 14px"};text-decoration:none;white-space:nowrap;border-radius:1px;flex-shrink:0}
  </style>
</head>
<body>
  <div class="wrap" data-slug="${safeText(slug)}" data-format="${orientation}">
    <div class="hero">${heroImage ? `<img src="${safeText(heroImage)}" data-b-hero alt="" onerror="this.parentElement.style.display='none'">` : ""}</div>
    <div class="cnt">
      ${isV ? `<div class="lw">${logoUrl ? `<img src="${safeText(logoUrl)}" data-b-logo alt="${safeText(clientName)}" onerror="this.style.display='none'">` : ""}</div>` : ""}
      <h2 data-b-name>${safeText(clientName)}</h2>
      <p data-b-claim>${safeText(claim)}</p>
    </div>
    <a class="cta" href="${safeText(waHref)}" data-b-cta target="_blank" rel="noopener">Solicitar Propuesta</a>
  </div>
</body>
</html>
`;
}

function buildBannerPackHtml({ clientName, slug, accentColor }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${safeText(clientName)} — Banner Pack</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#111;padding:24px;min-height:100vh;color:#fff}
    h1{font-size:20px;margin-bottom:6px}
    .sub{color:#aaa;font-size:13px;margin-bottom:32px}
    .sec{margin-bottom:40px}
    h2{color:${safeText(accentColor)};font-size:12px;letter-spacing:.15em;text-transform:uppercase;margin-bottom:12px;border-bottom:1px solid #333;padding-bottom:6px}
    iframe{border:none;display:block;border-radius:2px;background:#0a0a0a}
    .meta{color:#555;font-size:11px;margin-top:6px}
  </style>
</head>
<body>
  <h1>${safeText(clientName)}</h1>
  <p class="sub">Banner Pack — Immersphere v${SERVICE_VERSION}</p>
  <div class="sec">
    <h2>Vertical (400×700)</h2>
    <iframe src="../banner-vertical.html" width="400" height="700" title="Banner Vertical"></iframe>
    <div class="meta">400 × 700 px</div>
  </div>
  <div class="sec">
    <h2>Horizontal (728×90)</h2>
    <iframe src="../banner-horizontal.html" width="728" height="90" title="Banner Horizontal"></iframe>
    <div class="meta">728 × 90 px</div>
  </div>
</body>
</html>
`;
}

function buildLogoSvg(clientName: string, accentColor: string): string {
  const initials = clientName.split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40">
  <rect width="120" height="40" fill="${safeText(accentColor)}"/>
  <text x="60" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#000">${safeText(initials)}</text>
</svg>
`;
}

function buildVercelJsonPatch(slug: string): object[] {
  return [
    { source: `/gesture-lab/${slug}-v1`, destination: `/gesture-lab/${slug}-v1.html` },
    { source: `/dynamic-motion-banner/${slug}/banner-pack`, destination: `/dynamic-motion-banner/${slug}/banner-pack/index.html` },
    { source: `/dynamic-motion-banner/${slug}/banner-vertical`, destination: `/dynamic-motion-banner/${slug}/banner-vertical.html` },
    { source: `/dynamic-motion-banner/${slug}/banner-horizontal`, destination: `/dynamic-motion-banner/${slug}/banner-horizontal.html` },
  ];
}

// ─── AURUM component builders ─────────────────────────────────────────────────

function buildClientDemoData({ slug, camelBase, componentBase, clientName, sector, zone, website, logoUrl, heroImage, propertyImages, videoUrl, primaryColor, accentColor, waHref, telHref, emailHref, claim, digitalPresenceScore = 35 }) {
  const rubikBase = `https://${INTERNAL_ENGINE_DOMAIN}`;
  const aurumBase = `https://${CLIENT_FACING_DOMAIN}`;
  const gestureLabUrl = `${rubikBase}/gesture-lab/${slug}-v1`;
  const bannerPackUrl = `${rubikBase}/dynamic-motion-banner/${slug}/banner-pack`;
  const bannerVertUrl = `${rubikBase}/dynamic-motion-banner/${slug}/banner-vertical`;
  const bannerHorzUrl = `${rubikBase}/dynamic-motion-banner/${slug}/banner-horizontal`;
  const standaloneLanding = `${aurumBase}/${slug}`;
  const standaloneVisual = `${aurumBase}/visual-experience/${slug}`;
  return `// Auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}
import type { ClientDemo } from "@/types/clientDemo";

export const ${camelBase}: ClientDemo = {
  client: {
    slug: ${JSON.stringify(slug)},
    name: ${JSON.stringify(clientName)},
    sector: ${JSON.stringify(sector)},
    zone: ${JSON.stringify(zone)},
    website: ${JSON.stringify(website)},
    logo: ${JSON.stringify(logoUrl || "")},
    primaryColor: ${JSON.stringify(primaryColor)},
    accentColor: ${JSON.stringify(accentColor)},
  },
  audit: {
    digitalPresenceScore: ${Number.isFinite(digitalPresenceScore) ? digitalPresenceScore : 35},
    mobileFriendly: false,
    hasVideoContent: ${Boolean(videoUrl)},
    hasVirtualTour: false,
    conversionRateEstimate: "0.8%",
    opportunityDetected: ${JSON.stringify(claim)},
  },
  hero: {
    headline: ${JSON.stringify(`${clientName} — Experiencia Inmobiliaria Premium`)},
    subheadline: ${JSON.stringify(claim)},
    heroImage: ${JSON.stringify(heroImage || "")},
    heroVideo: ${JSON.stringify(videoUrl)},
    propertyImages: ${JSON.stringify(propertyImages.slice(0, 6))},
  },
  comparison: {
    currentWebsite: ${JSON.stringify(website)},
    currentScreenshot: "",
    immerspherePreview: ${JSON.stringify(standaloneLanding)},
    improvements: [
      "Experiencia visual inmersiva con motion design",
      "Galería de propiedades optimizada para conversión",
      "Integración directa con WhatsApp para leads calientes",
      "Presencia mobile-first premium",
    ],
  },
  visualExperience: {
    embedUrl: ${JSON.stringify(gestureLabUrl)},
    standaloneUrl: ${JSON.stringify(standaloneVisual)},
    bannerPackUrl: ${JSON.stringify(bannerPackUrl)},
    bannerVerticalUrl: ${JSON.stringify(bannerVertUrl)},
    bannerHorizontalUrl: ${JSON.stringify(bannerHorzUrl)},
  },
  highIntentContact: {
    label: "Solicitar propuesta premium",
    primaryHref: ${JSON.stringify(waHref)},
    secondaryHref: ${JSON.stringify(telHref)},
    emailHref: ${JSON.stringify(emailHref)},
  },
  salesContact: {
    emailSubject: ${JSON.stringify(`Propuesta Premium Immersphere — ${clientName}`)},
    emailBody: ${JSON.stringify(`Hola,\n\nAdjunto propuesta de experiencia inmobiliaria premium para ${clientName}.\n\nDemo interactivo: ${standaloneLanding}\n\n¿Cuándo podemos agendar una llamada de 20 minutos?\n\nSaludos,\nEquipo Immersphere`)},
    whatsappMessage: ${JSON.stringify(`Hola ${clientName}, te comparto el demo premium de tu nueva presencia digital: ${standaloneLanding}`)},
  },
  immersphereServices: {
    landing: ${JSON.stringify(standaloneLanding)},
    webCompleta: ${JSON.stringify(`${aurumBase}/${slug}-web-completa`)},
    visualExperience: ${JSON.stringify(standaloneVisual)},
    bannerPack: ${JSON.stringify(bannerPackUrl)},
  },
};
`;
}

function buildLandingComponent({ slug, componentBase, camelBase, clientName, heroImage, logoUrl, claim, waHref, accentColor }) {
  const ac = safeText(accentColor, "#d4af37");
  const hi = safeText(heroImage, "");
  const lo = safeText(logoUrl, "");
  const cl = safeText(clientName, slug);
  const ck = safeText(claim, "Experiencia inmobiliaria premium");
  const wh = safeText(waHref, "#contact");
  return `// Auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}
import React from "react";
import { ${camelBase} } from "@/data/clientDemos/${camelBase}";

export function ${componentBase}Landing() {
  const cfg = ${camelBase};
  const ac = cfg.client.accentColor || "${ac}";
  return (
    <main data-client-slug="${slug}" style={{ background: "#0a0a0a", color: "#fff", fontFamily: "Arial,sans-serif", minHeight: "100vh" }}>
      <section style={{ position: "relative", height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        ${hi ? `<img src="${hi}" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />` : ""}
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 24px", maxWidth: 800 }}>
          ${lo ? `<img src="${lo}" alt="${cl}" style={{ maxHeight: 64, marginBottom: 24, filter: "brightness(0) invert(1)" }} />` : ""}
          <h1 style={{ fontSize: "clamp(42px,8vw,96px)", fontWeight: 800, lineHeight: 1, marginBottom: 20 }}>${cl}</h1>
          <p style={{ fontSize: "clamp(18px,3vw,26px)", color: "rgba(255,255,255,0.8)", maxWidth: 680, margin: "0 auto 32px" }}>${ck}</p>
          <a href="${wh}" target="_blank" rel="noopener" style={{ background: ac, color: "#000", fontWeight: 700, padding: "16px 32px", textDecoration: "none", fontSize: 16, display: "inline-block", borderRadius: 2 }}>Solicitar Propuesta Premium</a>
        </div>
      </section>

      <section style={{ padding: "80px 24px", background: "#111" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 40 }}>Experiencia Visual</h2>
        <div style={{ maxWidth: 1100, margin: "0 auto", borderRadius: 8, overflow: "hidden" }}>
          <iframe src={cfg.visualExperience.embedUrl} style={{ width: "100%", height: 600, border: "none" }} title="Visual Experience ${safeText(clientName)}" />
        </div>
      </section>

      <section style={{ padding: "80px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 32, marginBottom: 20 }}>¿Listo para transformar tu presencia?</h2>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 18, marginBottom: 40, maxWidth: 600, margin: "0 auto 40px" }}>Solicita una propuesta personalizada y descubre cómo Immersphere puede multiplicar tus leads.</p>
        <a href={cfg.highIntentContact.primaryHref} target="_blank" rel="noopener" style={{ background: ac, color: "#000", fontWeight: 700, padding: "20px 48px", textDecoration: "none", fontSize: 18, display: "inline-block", borderRadius: 2 }}>Solicitar Propuesta Premium</a>
      </section>
    </main>
  );
}
`;
}

function buildWebCompletaComponent({ slug, componentBase, camelBase, clientName }) {
  const gestureLabUrl = `https://${INTERNAL_ENGINE_DOMAIN}/gesture-lab/${slug}-v1`;
  return `// Auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}
import React, { useEffect, useRef } from "react";
import { ${camelBase} } from "@/data/clientDemos/${camelBase}";

export function ${componentBase}WebCompleta() {
  const cfg = ${camelBase};
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { videoRef.current?.play().catch(() => {}); }, []);
  const ac = cfg.client.accentColor || "#d4af37";

  return (
    <main data-client-slug="${slug}" style={{ background: "#0a0a0a", color: "#fff", fontFamily: "Arial,sans-serif" }}>
      <section style={{ position: "relative", height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {cfg.hero.heroVideo ? (
          <video ref={videoRef} src={cfg.hero.heroVideo} muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
        ) : cfg.hero.heroImage ? (
          <img src={cfg.hero.heroImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
        ) : null}
        <div style={{ position: "relative", textAlign: "center", padding: "0 24px" }}>
          {cfg.client.logo && <img src={cfg.client.logo} alt={cfg.client.name} style={{ maxHeight: 64, marginBottom: 24, filter: "brightness(0) invert(1)" }} />}
          <h1 style={{ fontSize: "clamp(42px,8vw,96px)", fontWeight: 800, lineHeight: 1, marginBottom: 20 }}>{cfg.client.name}</h1>
          <p style={{ fontSize: "clamp(18px,3vw,26px)", color: "rgba(255,255,255,0.8)", maxWidth: 680, margin: "0 auto 32px" }}>{cfg.hero.subheadline}</p>
          <a href={cfg.highIntentContact.primaryHref} target="_blank" rel="noopener" style={{ background: ac, color: "#000", fontWeight: 700, padding: "16px 32px", textDecoration: "none", fontSize: 16, display: "inline-block" }}>Solicitar Propuesta Premium</a>
        </div>
      </section>

      <section style={{ padding: "80px 24px", background: "#111" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 40 }}>Experiencia Visual</h2>
        <div style={{ maxWidth: 1100, margin: "0 auto", borderRadius: 8, overflow: "hidden" }}>
          <iframe src="${gestureLabUrl}" style={{ width: "100%", height: 600, border: "none" }} title="Visual Experience ${safeText(clientName)}" />
        </div>
      </section>

      <section style={{ padding: "80px 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 40 }}>Galería de Propiedades</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16, maxWidth: 1100, margin: "0 auto" }}>
          {cfg.hero.propertyImages.slice(0, 6).map((src, i) => (
            <img key={i} src={src} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 4 }} />
          ))}
        </div>
      </section>

      <section style={{ padding: "80px 24px", background: "#111" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 40 }}>Tu Presencia Digital Transformada</h2>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {cfg.comparison.improvements.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "flex-start" }}>
              <span style={{ color: ac, fontSize: 20, flexShrink: 0 }}>✓</span>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16 }}>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "80px 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 40 }}>Banners de Campaña</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center", maxWidth: 1200, margin: "0 auto" }}>
          <iframe src={cfg.visualExperience.bannerVerticalUrl} style={{ width: 400, height: 700, border: "none", borderRadius: 4 }} title="Banner Vertical" />
          <iframe src={cfg.visualExperience.bannerHorizontalUrl} style={{ width: 728, height: 90, border: "none", borderRadius: 4 }} title="Banner Horizontal" />
        </div>
      </section>

      <section style={{ padding: "80px 24px", background: "#111" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 40 }}>Servicios Immersphere</h2>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {([["Landing Page Premium", cfg.immersphereServices.landing], ["Web Completa", cfg.immersphereServices.webCompleta], ["Visual Experience", cfg.immersphereServices.visualExperience], ["Banner Pack", cfg.immersphereServices.bannerPack]] as [string, string][]).map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener" style={{ background: "#1a1a1a", border: "1px solid #333", padding: "20px 24px", textDecoration: "none", color: "#fff", borderRadius: 4, display: "block" }}>
              <span style={{ color: ac, fontSize: 12, letterSpacing: ".15em", textTransform: "uppercase" as const, display: "block", marginBottom: 8 }}>Abrir</span>
              <strong>{label}</strong>
            </a>
          ))}
        </div>
      </section>

      <section style={{ padding: "80px 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 40 }}>Auditoría Digital</h2>
        <div style={{ maxWidth: 700, margin: "0 auto", background: "#111", borderRadius: 8, padding: "32px 40px" }}>
          {([["Puntuación actual", String(cfg.audit.digitalPresenceScore) + "/100"], ["Mobile friendly", cfg.audit.mobileFriendly ? "Sí" : "No"], ["Conversión estimada", cfg.audit.conversionRateEstimate]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: "#aaa" }}>{k}</span><strong style={{ color: k === "Puntuación actual" ? ac : "#fff" }}>{v}</strong>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "100px 24px", textAlign: "center", background: "linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 100%)" }}>
        <h2 style={{ fontSize: 40, marginBottom: 20 }}>¿Listo para transformar tu presencia?</h2>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 18, marginBottom: 40, maxWidth: 600, margin: "0 auto 40px" }}>Solicita una propuesta personalizada y descubre cómo Immersphere puede multiplicar tus leads.</p>
        <a href={cfg.highIntentContact.primaryHref} target="_blank" rel="noopener" style={{ background: ac, color: "#000", fontWeight: 700, padding: "20px 48px", textDecoration: "none", fontSize: 18, display: "inline-block", borderRadius: 2 }}>Solicitar Propuesta Premium</a>
      </section>
    </main>
  );
}
`;
}

function buildIframeWrapper({ slug, componentBase, type }) {
  const suffix = type.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  const urlMap: Record<string, { url: string; w: string; h: string }> = {
    "visual-experience": { url: `https://${INTERNAL_ENGINE_DOMAIN}/gesture-lab/${slug}-v1`, w: "100%", h: "100vh" },
    "banner-pack": { url: `https://${INTERNAL_ENGINE_DOMAIN}/dynamic-motion-banner/${slug}/banner-pack`, w: "100%", h: "900px" },
    "banner-vertical": { url: `https://${INTERNAL_ENGINE_DOMAIN}/dynamic-motion-banner/${slug}/banner-vertical`, w: "400px", h: "700px" },
    "banner-horizontal": { url: `https://${INTERNAL_ENGINE_DOMAIN}/dynamic-motion-banner/${slug}/banner-horizontal`, w: "728px", h: "90px" },
  };
  const dim = urlMap[type] || { url: "#", w: "100%", h: "600px" };
  const needsCentering = type !== "visual-experience";
  return `// Auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}
import React from "react";

export function ${componentBase}${suffix}() {
  return (
    <div style={{ ${needsCentering ? 'display: "flex", justifyContent: "center", padding: "40px 24px"' : 'width: "100%", height: "100vh", overflow: "hidden"'} }}>
      <iframe
        src="${dim.url}"
        style={{ width: "${dim.w}", height: "${dim.h}", border: "none" }}
        title="${type} ${slug}"
        allow="autoplay"
      />
    </div>
  );
}
`;
}

function buildAppTsxPatch({ slug, componentBase }): object {
  return {
    slug,
    componentBase,
    imports: [
      `import { ${componentBase}Landing } from "./${componentBase}Landing";`,
      `import { ${componentBase}WebCompleta } from "./${componentBase}WebCompleta";`,
      `import { ${componentBase}VisualExperience } from "./${componentBase}VisualExperience";`,
      `import { ${componentBase}BannerPack } from "./${componentBase}BannerPack";`,
      `import { ${componentBase}BannerVertical } from "./${componentBase}BannerVertical";`,
      `import { ${componentBase}BannerHorizontal } from "./${componentBase}BannerHorizontal";`,
    ],
    routes: [
      `<Route path="/${slug}" element={<${componentBase}Landing />} />`,
      `<Route path="/${slug}-web-completa" element={<${componentBase}WebCompleta />} />`,
      `<Route path="/visual-experience/${slug}" element={<${componentBase}VisualExperience />} />`,
      `<Route path="/banners/${slug}" element={<${componentBase}BannerPack />} />`,
      `<Route path="/banners/${slug}/vertical" element={<${componentBase}BannerVertical />} />`,
      `<Route path="/banners/${slug}/horizontal" element={<${componentBase}BannerHorizontal />} />`,
    ],
  };
}
