# Four Hooks Engine Map v0.1

Status: partial engine map. This document does not claim that the four hooks are automatic yet.

## Purpose

The current system already has useful pieces across CRM/backend, AURUM, and Rubik. The missing layer is a formal contract that turns enriched lead data into four differentiated commercial hooks:

1. Visual Experience.
2. Commercial Landing.
3. Full Website Demo.
4. Banner Pack: vertical, horizontal, and pack view.

This map records what exists today, what is reusable, and what is still scaffolding.

## CRM/backend

| Layer | File | What it does | Engine / pattern / scaffolding | Reusable | Risk |
|---|---|---|---|---|---|
| CRM | `crm.html`, `index.html` | Holds lead data, commercial hooks, launcher UI, local state, and operator workflow entry points. | Pattern plus static CRM surface | Yes | Lead data can stay richer than backend payload if not mapped explicitly. |
| Backend plan | `automation-backend/src/buildPrAutomationPlan.ts` | Builds PR plan, branches, target repos, generated files, proposal package, and blocked write state. | Orchestrator | Yes | It plans files but does not create creative strategy. |
| Backend files | `automation-backend/src/fileGenerators.ts` | Generates Rubik files, AURUM production manifest, production plan, and proposal package TS files. | Scaffolding generator | Yes, as extension point | Current output is manifests/basic HTML, not real AURUM components. |
| Backend copy | `automation-backend/src/proposalPackage.ts` | Builds `fourHooks`, summary, WhatsApp, email, call script, follow-up, and review checklist. | Metadata/copy seed | Yes | Copy can remain generic and `status: planned` is not a public-facing product state. |
| Backend dry-run | `automation-backend/src/buildDryRunPlan.ts` | Plans templates, files, media plan, visual risks, and QA checklist. | Planning layer | Yes | Template names are not specs; they do not guarantee real output quality. |
| Backend schema | `automation-backend/src/schemas.ts` | Defines required lead fields, route fields, constants, and limits. | Contract seed | Yes | Does not yet define enrichment/spec objects. |
| Operator console | `automation-backend/src/operatorConsoleHtml.ts` | Human operator UI for preflight and PR automation. | Workflow surface | Yes | Should enforce QA gates before create-prs in a later phase. |
| Docs | `docs/07-protocolo-enriquecimiento-leads.md` | Defines enrichment expectations from official site/contact/footer. | Data protocol | Yes | Manual protocol, not enforced as a typed object yet. |
| Docs | `docs/08-checklist-lead-real.md` | Pre-create-prs checklist for real leads. | QA checklist | Yes | Needs anti-generic gates tied to specs. |

Conclusion for CRM/backend: it orchestrates and validates, but it does not yet create full creative strategy. It is the right place to host the engine contract and future spec builders.

## AURUM

| Layer | File | What it does | Engine / pattern / scaffolding | Reusable | Risk |
|---|---|---|---|---|---|
| Data config | `src/data/clientDemos/casasYMar.ts` | Rich client data, audit, assets, visual experience, CTAs, sections. | Strong pattern | Yes | Client-specific; needs normalization into a contract. |
| Data config | `src/data/clientDemos/costaInvest.ts` | Rich client data, international buyer context, assets, visual routes, contact. | Strong pattern | Yes | Strong for real estate, less generic outside sector. |
| Data config | `src/data/clientDemos/sandhouse.ts` | Sandhouse enriched data, contact, audit, hero, visual experience, services, CTA. | Usable pattern | Yes | Improved manually; still not proven as golden. |
| Shared component | `src/components/clientDemo/CurrentWebsiteComparisonSection.tsx` | Compares current website vs proposal. | Reusable component | Yes | Needs spec fields for diagnosis and bullets. |
| Shared component | `src/components/clientDemo/VisualExperienceBannerSection.tsx` | Embeds/frames the visual experience with copy and CTA. | Reusable component | Yes | If the iframe is weak, this section inherits that weakness. |
| Shared component | `src/components/clientDemo/ImmersphereServicesSection.tsx` | Explains system/services proposal. | Reusable component | Yes | Can become generic if not driven by client diagnosis. |
| Shared component | `src/components/clientDemo/HighIntentContactSection.tsx` | Contact CTA block. | Reusable component | Yes | Needs verified phone/email/WhatsApp. |
| Demo | `src/CasasYMarDemo.tsx` and `src/components/casasYMar/*` | Full premium client demo with many custom sections. | Golden/manual pattern | Yes | Too client-specific unless decomposed into specs. |
| Demo | `src/CostaInvestDemo.tsx` | Landing/demo using shared sections and data config. | Strong pattern | Yes | Mostly manual composition. |
| Demo | `src/CostaInvestWebCompleta.tsx` | Full website demo with hero, diagnosis, visual, properties, markets, services, process, contact. | Strong pattern | Yes | Best candidate for `FullWebsiteSpec`. |
| Demo | `src/CostaInvestVisualExperience.tsx` | Public visual experience wrapper. | Pattern | Yes | Depends on Rubik visual quality. |
| Demo | `src/CostaInvestBannerPack.tsx`, `src/CostaInvestBannerVertical.tsx`, `src/CostaInvestBannerHorizontal.tsx` | Banner pack and direct banner routes. | Pattern | Yes | Needs normalized `BannerPackSpec`. |
| Demo | `src/Sandhouse*.tsx` | Manual personalized Sandhouse four-hook pages. | Usable/manual pattern | Yes | Still has manual copy and should pass QA gates before being called golden. |

Conclusion for AURUM: the strongest public pattern is Casas y Mar plus Costa Invest. AURUM already contains reusable components and data configs, but not a typed engine that renders all four hooks from specs.

## Rubik

| Layer | File | What it does | Engine / pattern / scaffolding | Reusable | Risk |
|---|---|---|---|---|---|
| Visual engine | `dynamic-motion-banner/casas-y-mar-visita-propiedad/banner-engine.js` | Canvas/banner engine for client-facing dynamic visual. | Engine | Yes | Needs config-driven generation for new clients. |
| Visual package | `dynamic-motion-banner/casas-y-mar-visita-propiedad/**` | Assets, config, manifest, visual experience, embed, vertical/horizontal banners. | Strong pattern | Yes | Asset rights and client-specific tuning. |
| Visual package | `dynamic-motion-banner/costa-invest/**` | Costa Invest dynamic visual experience and banner pack. | Strong pattern | Yes | More complete than Sandhouse. |
| Visual package | `dynamic-motion-banner/sandhouse-inmobiliaria/**` | Sandhouse visual files, config, manifest, basic pages. | Scaffolding/partial | Yes, but weak | Can degrade public perception if used as main visual. |
| Editor/source | `gesture-lab/dynamic-motion-banners/rubik-sota-dynamic-motion-banners-v0-3.html` | Advanced editor/export workflow. | Internal engine | Yes | Too large for direct PR generation without contract. |
| Client v1 | `gesture-lab/dynamic-motion-banners/*casas-y-mar-v1.html` | Client-specific v1 derived from v0.3. | Strong pattern | Yes | Hard-coded client logic. |
| Client v1 | `gesture-lab/dynamic-motion-banners/*costa-invest-v1.html` | Client-specific v1 derived from v0.3. | Strong pattern | Yes | Hard-coded client logic. |

Conclusion for Rubik: it has the strongest visual engine, but the engine is not yet formalized into spec-driven client generation. Sandhouse Rubik is not a golden reference.

## Overall conclusion

- Existing engine: partial.
- Strongest patterns: Casas y Mar and Costa Invest.
- Sandhouse: improved/manual case, not yet golden.
- Backend: orchestrates, validates, and writes plan artifacts, but does not yet create complete creative strategy.
- Next safe step: define contracts and QA gates before automating generation.

