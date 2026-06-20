# Four Hooks QA Gates v0.1

Status: mandatory review checklist before claiming four hooks are generated.

## Rule

If these gates do not pass, the system must not say "four hooks generated". It may say "planned", "drafted", or "ready for human review" only in internal tools/docs.

## Data gates

- Official website confirmed.
- Contact page and footer reviewed.
- Email captured if public.
- Phone or WhatsApp captured if public.
- Address captured if public.
- Schedule captured if public.
- Tagline or value proposition captured if present.
- `sourceUrls` recorded.
- `lastCheckedAt` recorded.
- No public copy contains unknown placeholders.
- If assets are not rights-cleared, public copy does not pretend they are real client assets.

## Copy gates

Forbidden in public-facing copy:

- `url_pendiente_confirmar`
- `experiencia_visual_premium`
- `Internal draft`
- `Rubik Internal Engine`
- `pending`
- `pendiente de confirmar`
- `lorem`
- `planned`
- `generated`
- `GITHUB_SERVER_TOKEN`
- `ghp_`
- `github_pat_`
- mojibake markers such as `Â`, `Ã`, or replacement characters

Required:

- Each hook has its own CTA.
- Each hook has its own commercial purpose.
- Copy references client name, sector/offer, and zone/market.
- Landing copy is not reused as full website copy.
- Banner copy is format-specific.
- Internal notes stay out of public pages.

## Technical gates

- Backend build passes when backend files change.
- Backend tests pass when backend behavior/tests change.
- AURUM build passes when AURUM files change.
- Rubik page parses/loads when Rubik files change.
- Public routes load without blank screens.
- Mobile viewport is checked.
- Desktop viewport is checked.
- No secrets are committed or printed.
- `generated: true` is not set until final URL validation.
- `create-prs` is not run without preflight and explicit approval.
- No iframe is the only substance of a hook page.

## Differentiation gates

- Landing is not the visual experience.
- Visual experience is not the full website.
- Full website is not just a longer landing.
- Banner pack is not a link list.
- Vertical banner is not only a resized horizontal banner.
- Horizontal banner is not only a resized vertical banner.
- The pack view includes meaningful previews.

## Rejection criteria

Reject the PR or production package if:

- Any forbidden string appears in public-facing output.
- Any hook lacks a route, CTA, purpose, or specific message.
- The client could be swapped for another name without changing the meaning.
- The package contains only manifests, routes, or iframes and no differentiated user-facing pieces.
- The visual layer is visibly weaker than the claimed commercial quality.

## Minimum review evidence

For every real lead, the PR description should include:

- Lead slug.
- Source URLs reviewed.
- Routes generated or planned.
- Files changed.
- QA commands run.
- Any known limitations.
- Human reviewer required before merge.

