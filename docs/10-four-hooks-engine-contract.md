# Four Hooks Engine Contract v0.1

Status: contract draft. This is not a complete implementation.

## Flow

```text
LeadEnrichmentData
-> BrandSnapshot
-> CommercialDiagnosis
-> HookStrategy[]
-> FourHookPackage
-> LandingSpec / VisualExperienceSpec / FullWebsiteSpec / BannerPackSpec
-> AURUM / Rubik
-> QA gates
-> PR review
```

## LeadEnrichmentData

Purpose: canonical source of verified lead facts before any hook is generated.

Minimum fields:

- `clientName`: CRM display name.
- `commercialName`: normalized public brand name.
- `slug`: kebab-case stable slug.
- `website`: official website URL.
- `sector`: business sector.
- `city`: primary city.
- `zone`: commercial zone.
- `province`: province/region.
- `email`: verified public email if available.
- `phones`: verified phone list.
- `address`: verified public address if available.
- `schedule`: verified schedule if available.
- `tagline`: real or clearly derived tagline.
- `services`: services detected from official sources.
- `audience`: buyer/user audience.
- `propertyTypes`: for real estate, property types or portfolio signals.
- `differentiators`: real strengths or inferred competitive edges.
- `sourceUrls`: official URLs used for evidence.
- `confidence`: confidence per field or global confidence level.
- `lastCheckedAt`: ISO date/time of last manual or automated check.

Required QA:

- No field used in public copy can contain unknown placeholder values.
- Every public claim must trace back to `sourceUrls` or be marked as inferred internal strategy.

## BrandSnapshot

Purpose: translate facts into design and tone direction.

Minimum fields:

- `tone`: e.g. premium, local, direct, institutional, aspirational.
- `visualStyle`: e.g. Mediterranean editorial, technical dashboard, luxury real estate.
- `palette`: color direction, with source if derived from assets.
- `typographyDirection`: serif/editorial, geometric, minimal, etc.
- `brandPersonality`: short description.
- `trustSignals`: years, office, reviews, team, location, specialization, certifications.
- `visualReferences`: official images/assets or placeholders with rights status.
- `forbiddenClaims`: claims that must not be made.

Required QA:

- If no assets are rights-cleared, public pages must use abstract/editorial placeholders and internal notes must say assets need rights review.

## CommercialDiagnosis

Purpose: define why this client needs the four hooks.

Minimum fields:

- `painDetected`: concrete commercial pain.
- `opportunityDetected`: concrete opportunity.
- `marketContext`: market situation.
- `competitiveGap`: what competitors or current site fail to solve.
- `buyerMotivation`: what makes buyers act.
- `ownerMotivation`: what makes owners or decision makers act.
- `conversionProblem`: where current conversion leaks.
- `recommendedAngle`: primary campaign angle.

Required QA:

- Must reference the client sector/zone.
- Must not be interchangeable with a different client without edits.

## HookStrategy

Purpose: one strategic brief per hook.

Minimum fields:

- `hookId`: `visualExperience`, `landing`, `fullWebsite`, or `bannerPack`.
- `hookName`: public hook name.
- `commercialPurpose`: why it exists.
- `targetAudience`: buyer, owner, decision maker, visitor, etc.
- `mainMessage`: core message.
- `supportingMessages`: secondary messages.
- `CTA`: primary call to action.
- `proofPoints`: facts or evidence.
- `visualDirection`: layout/media/motion direction.
- `route`: public route.
- `successCriteria`: what review must confirm.

Required QA:

- Each hook must have a distinct purpose, message, and CTA.
- A hook cannot be a link list only.

## FourHookPackage

Purpose: bundle all four hook strategies and specs.

Must contain:

- `visualExperience`: `HookStrategy` plus `VisualExperienceSpec`.
- `landing`: `HookStrategy` plus `LandingSpec`.
- `fullWebsite`: `HookStrategy` plus `FullWebsiteSpec`.
- `bannerPack`: `HookStrategy` plus `BannerPackSpec`.

Required QA:

- Landing, visual experience, full website, and banner pack must differ in structure and purpose.
- Public copy must not expose internal workflow language.

## LandingSpec

Consumes:

- AURUM public layer.

Produces routes:

- `/{slug}`
- Optional aliases defined by target routes.

Required fields:

- `hero`: headline, subheadline, primary CTA, secondary CTA.
- `diagnosis`: commercial diagnosis summary.
- `comparison`: current situation vs opportunity.
- `fourHooks`: concise preview of all hooks.
- `contact`: verified public contact.
- `nextStep`: next commercial action.

Non-generic fields:

- Headline, diagnosis, CTA, and contact must be client-specific.

QA:

- Must not look like backend status page.
- Must not expose words such as "planned" or "internal draft" in public copy.

## VisualExperienceSpec

Consumes:

- AURUM public wrapper.
- Rubik visual asset package.

Produces routes:

- `/{slug}/visual-experience`
- `/visual-experience/{slug}`
- Rubik embed route if needed.

Required fields:

- `narrative`: visit/story arc.
- `embedUrl` or `visualAssetRoute`.
- `firstImpression`: first-screen copy.
- `journeyBlocks`: 3 or more moments in the visual journey.
- `CTA`: action.
- `fallbackPlan`: if visual assets are not rights-cleared.

Non-generic fields:

- Journey must match sector, zone, and buyer motivation.

QA:

- Must not be only an iframe.
- If iframe is present, surrounding page must sell the experience.

## FullWebsiteSpec

Consumes:

- AURUM public layer.

Produces routes:

- `/{slug}/web-completa`
- `/{slug}-web-completa`

Required fields:

- `hero`
- `valueProposition`
- `zonesOrMarkets`
- `services`
- `featuredEditorialItems`
- `method`
- `visualExperienceSection`
- `contact`
- `finalCTA`

Non-generic fields:

- Services, zones, market context, and method must be client-specific.

QA:

- Must not be a repeated landing.
- Must feel like a complete website demo.

## BannerPackSpec

Consumes:

- AURUM public pack pages.
- Rubik banner engine/assets where useful.

Produces routes:

- `/banners/{slug}`
- `/banners/{slug}/vertical`
- `/banners/{slug}/horizontal`
- Optional `/{slug}/banners`

Required fields:

- `claims`: at least 3 campaign claims.
- `formats`: vertical 9:16, horizontal 16:9, optional 4:5.
- `formatSpecificCopy`: different composition per format.
- `CTA`: action.
- `contact`: verified public contact.
- `visualDirection`: motion/static/export direction.

Non-generic fields:

- Claims and CTA must reflect the client, zone, and offer.

QA:

- Vertical and horizontal must not be simple resizes.
- Pack view must show real previews, not just links.

## Versioning and ownership

- CRM/backend owns the contract and spec generation.
- AURUM owns public rendering.
- Rubik owns visual/motion asset generation.
- Specs should be committed in reviewable PRs and never silently written to main.

