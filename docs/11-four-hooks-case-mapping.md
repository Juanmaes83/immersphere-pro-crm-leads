# Four Hooks Case Mapping v0.1

Status: reference mapping. This document does not implement generation.

## Summary table

| Client | LeadEnrichmentData | BrandSnapshot | Diagnosis | Landing | Visual Experience | Full website | Banners | State |
|---|---|---|---|---|---|---|---|---|
| Casas y Mar | Strong: CRM lead plus AURUM data config and Rubik assets | Strong: real assets, local real estate tone | Strong: current catalog vs immersive property experience | Strong demo in AURUM | Strong Rubik dynamic visual + AURUM embed | Strong modular demo | Strong vertical/horizontal via Rubik | golden |
| Costa Invest | Strong: AURUM data config plus real assets and market context | Strong: international buyer/premium Costa Blanca direction | Strong: international remote buyer angle | Strong demo in AURUM | Strong Rubik/AURUM integration | Strong `CostaInvestWebCompleta` | Strong banner pack/routes | golden |
| Sandhouse | Usable: data exists in AURUM `sandhouseDemo` and CRM docs | Usable: local Torrevieja/Costa Levantina direction | Usable: competitive visual differentiation | Usable but manually improved | Partial: AURUM wrapper plus weaker Rubik package | Usable but still needs final QA | Usable CSS previews, limited asset depth | partial |

## Casas y Mar

Real data available:

- CRM lead fields in static CRM.
- AURUM `src/data/clientDemos/casasYMar.ts`.
- Rubik `dynamic-motion-banner/casas-y-mar-visita-propiedad/**`.
- Client assets under AURUM and Rubik.

Hooks:

- Visual Experience: strong client-facing dynamic motion banner, embed route, QR, CTA, property visuals.
- Landing: strong AURUM demo with diagnosis, comparison, visual section, services, contact.
- Full website: represented through the modular Casas y Mar demo, not a separately named `WebCompleta` file.
- Banners: strong Rubik vertical/horizontal assets and engine.

Reusable pattern:

- Rich `clientDemos` data.
- Shared sections such as comparison, visual experience, services, high-intent contact.
- Rubik `banner-engine.js` plus config/assets structure.

Risks:

- Highly bespoke components under `components/casasYMar`.
- Needs normalization before becoming a generic engine.

## Costa Invest

Real data available:

- AURUM `src/data/clientDemos/costaInvest.ts`.
- AURUM public components for demo, full website, visual experience, banner pack, vertical, horizontal.
- Rubik `dynamic-motion-banner/costa-invest/**`.
- Rubik and AURUM client assets.

Hooks:

- Visual Experience: public route plus Rubik visual package.
- Landing: `CostaInvestDemo`.
- Full website: `CostaInvestWebCompleta`.
- Banners: `CostaInvestBannerPack`, `CostaInvestBannerVertical`, `CostaInvestBannerHorizontal`, and Rubik banner pack.

Reusable pattern:

- Best concrete model for a complete four-hook real estate package.
- Good candidate to extract `FullWebsiteSpec` and `BannerPackSpec`.

Risks:

- Still manually assembled.
- Strong in real estate/international buyer context, not automatically cross-sector.

## Sandhouse

Real data available:

- CRM docs confirm official website, email, phones, address, schedule, and tagline.
- AURUM `src/data/clientDemos/sandhouse.ts`.
- AURUM `src/Sandhouse*.tsx`.
- Rubik `dynamic-motion-banner/sandhouse-inmobiliaria/**`.

Hooks:

- Visual Experience: AURUM page with narrative and iframe; Rubik visual is still basic compared with Casas/Costa.
- Landing: improved AURUM landing, data-driven from `sandhouseDemo`.
- Full website: improved AURUM web-completa with zones, services, properties, method, contact.
- Banners: AURUM pack and format pages with CSS previews; still not asset-rich like Casas/Costa.

Reusable pattern:

- Good test case for applying the contract to a newer client.
- Useful for defining anti-generic QA because it exposes the weak points.

Risks:

- Not yet golden.
- Public copy should pass mojibake and placeholder checks.
- Rubik package is partial and can weaken the visual experience.

## Conclusion

- Best reference cases: Casas y Mar and Costa Invest.
- Best case to turn into the next golden standard: Sandhouse after QA cleanup and stronger Rubik visual asset package.
- What Sandhouse lacks to be golden:
  - stronger visual asset layer;
  - final anti-generic QA pass;
  - no visible workflow/review language in public copy;
  - no mojibake;
  - richer differentiation between landing, visual experience, full website, and banner pack.

