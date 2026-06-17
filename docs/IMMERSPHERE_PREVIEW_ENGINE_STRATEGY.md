Immersphere Preview Engine — Strategy & Roadmap
1. Strategic Decision

The key decision is simple:

Do not create five separate products.
Build one central engine: Immersphere Preview Engine.
Then adapt the output template by vertical.

Immersphere Preview Engine is the commercial bridge between:

immersphere-pro-crm-leads
Immersphere Pro SaaS
lead generation
visual previews
private landing pages
QR tracking
manual outreach
future paid services

The objective is not to build isolated products for real estate, hotels, restaurants, awnings, interior design, reforms or property administrators.

The objective is to build one reusable lead-to-preview system that can generate a personalized commercial preview for each qualified lead.

2. Core Concept

Immersphere Preview Engine turns a qualified business lead into a private, visual, trackable preview.

Basic flow:

Lead
→ Web audit
→ Opportunity detected
→ Proposal angle
→ Digital postcard / preview card
→ Private landing page
→ QR
→ Manual outreach
→ Manual tracking
→ Follow-up

The system must help us answer one question for every lead:

“What would this business look like if Immersphere improved its visual sales experience?”

The preview should make the opportunity visible before the sales conversation.

3. Why This Matters

A normal CRM stores leads.

Immersphere CRM should do more:

Find the lead
Audit the opportunity
Generate the preview
Prepare the pitch
Track the response
Help close the client

This turns the CRM from a database into a sales weapon.

The value is not only in automation. The value is in showing the business owner a personalized improvement before asking for a meeting.

This is the strategic difference:

Generic outreach:
"Hi, we offer virtual tours."

Immersphere outreach:
"We prepared a private preview showing how your listings could become interactive sales assets with tour, QR, video and floorplan."
4. One Engine, Multiple Vertical Templates

The engine is shared. Only the template changes.

Vertical Template Map
Vertical	Preview Template	Commercial Angle
Real Estate	Premium listing / tour / video / floorplan	More qualified visits, better property presentation, seller acquisition
Hotels	Visual post / booking landing / room or space tour	More direct bookings, stronger visual brand, premium positioning
Restaurants	Hero dish / QR menu / local tour	Better menu experience, more orders, more reservations
Interior Design	Showroom / interactive catalog	More showroom visits, product discovery, consultation leads
Reforms / Construction	Before-after visual / facade / terrace	Visualize transformation before quoting
Awning / Outdoor Comfort Companies	Terrace/storefront seasonal transformation	Sell shade, rain cover, heaters or enclosures with visual proof
Property Administrators	Community visual report / maintenance / energy upgrade	Help communities understand improvements and approve budgets
5. First Implementation Scope
Phase 4A — Opportunity-to-Preview for Real Estate

We start with real estate only.

Reason:

It is the core market of Immersphere Pro.
It connects directly with Floorfy-style benchmarking.
The CRM already has real estate lead structure, audit, scoring and commercial templates.
The SaaS already has relevant modules: tours, QR, capture jobs, guided visits, leads and visual assets.
It is the easiest vertical to package commercially.
Phase 4A Flow
Real estate lead
→ Website audit
→ Opportunity diagnosis
→ Recommended offer
→ Digital postcard
→ Private landing page
→ QR
→ Manual send
→ Manual tracking
Phase 4A Output

For each real estate lead, the CRM should generate:

Opportunity diagnosis
Recommended Immersphere pack
Short sales pitch
Digital postcard / preview card
Private preview landing page
QR pointing to the landing
Manual outreach message
Manual tracking fields
6. Phase 4A Functional Requirements
6.1 Lead Inputs

The engine should read from existing lead data:

lead.name
lead.website
lead.city
lead.verticalProfile
lead.score
lead.websiteAudit
lead.websiteOpportunityScore
lead.detectedSignals
lead.missingSignals
lead.notes
lead.status

Required minimum:

name
website or source URL
verticalProfile = real_estate
websiteAudit result

If the lead does not have a web audit, the UI should suggest running the audit first.

6.2 Opportunity Diagnosis

The CRM should generate a short diagnosis based on the audit.

Example:

Your website presents properties, but each listing still works mostly as a static showcase. There is an opportunity to turn selected listings into interactive sales assets with tour, QR, short video and floorplan.

The diagnosis must be specific to real estate.

It should avoid generic claims.

Good:

The site has property listings but no clear virtual tour, video-first presentation or QR-driven property preview.

Bad:

Your digital marketing can be improved with innovative solutions.
6.3 Recommended Pack

For real estate, the first pack should be:

Immersphere Real Estate Preview Pack

Suggested components:

- Premium property preview
- 360 tour
- QR for window display / brochure / WhatsApp
- Short video from property photos
- Basic floorplan or floorplan-ready module
- Lead capture CTA
- Optional guided visit

The CRM should select the recommendation based on audit gaps:

Missing Signal	Suggested Angle
No virtual tour	Add 360 tour
No video	Add property video
No QR	Add QR preview for window/brochure
No clear CTA	Add lead capture CTA
No floorplan	Add floorplan/basic layout
Weak listing presentation	Add premium property landing
No live visit	Add guided remote visit
6.4 Digital Postcard

The digital postcard is the first commercial artifact.

It should be lightweight, fast and generated inside the CRM.

Purpose:

Create a visual sales hook that can be sent manually by WhatsApp, email or printed later.

Suggested copy structure:

Headline:
"Tu próxima visita empieza antes de pisar la vivienda."

Subheadline:
"Hemos preparado una preview privada para mostrar cómo tus inmuebles pueden convertirse en experiencias interactivas con tour, vídeo, plano y QR."

CTA:
"Escanea el QR para ver la propuesta."

Optional alternatives:

"Cada inmueble puede vender antes de la visita."
"Convierte tus fichas en experiencias."
"Menos visitas frías. Más compradores preparados."
"Del anuncio estático a la visita interactiva."

The postcard should include:

- Lead name
- City / area if available
- Recommended pack
- QR
- Short CTA
- Immersphere branding
- Preview URL
6.5 Private Landing Page

Each generated preview should have a private route.

Suggested route:

/preview/{leadSlug}

Initial MVP can be static/client-side inside the CRM if backend is not ready.

Landing structure:

1. Hero
   - Business name
   - Personalized headline
   - One-line opportunity

2. Diagnosis
   - What was detected
   - What is missing
   - Why it matters

3. Recommended Preview
   - Premium listing
   - Tour
   - Video
   - Floorplan
   - QR
   - Lead CTA

4. Suggested Pack
   - Name
   - Components
   - Starting offer or consultation CTA

5. Call to Action
   - Book call
   - Request demo
   - Reply by WhatsApp/email

The first version does not need complex AI visuals.

The first version must prove the commercial flow.

6.6 QR

The QR should point to the private preview URL.

MVP requirements:

- Generate QR from previewUrl
- Show QR in the CRM
- Show QR in the digital postcard
- Allow copying/opening the preview URL

Future:

- QR scan tracking
- UTM parameters
- per-lead analytics
- event log
6.7 Manual Tracking

Phase 4A must be manual first.

No automatic sending.

Tracking fields:

previewGenerated: boolean
previewGeneratedAt: datetime
previewUrl: string
qrGenerated: boolean
sentAt: datetime | null
sentChannel: "whatsapp" | "email" | "phone" | "postal" | "other" | null
opened: boolean
openedAt: datetime | null
responded: boolean
respondedAt: datetime | null
nextAction: string
previewStatus: "not_generated" | "generated" | "sent" | "opened" | "responded" | "won" | "lost"

Manual buttons:

Generate preview
Open preview
Copy preview URL
Copy WhatsApp message
Copy email
Mark as sent
Mark as opened
Mark as responded
7. What Phase 4A Must NOT Do

To avoid losing focus, Phase 4A must not include:

- Automatic email sending
- Automatic WhatsApp sending
- Physical postcard sending
- AI-generated 3D models
- SLAM
- Floorplan generation
- Full video generation
- Multi-vertical templates
- Scraping expansion
- Paid ads
- Complex analytics

Phase 4A is about proving:

Lead → audit → preview → QR → manual outreach → tracking

Everything else comes later.

8. Product Boundaries
CRM Responsibility

immersphere-pro-crm-leads should handle:

- lead data
- audit result
- opportunity diagnosis
- preview generation
- preview copy
- QR
- manual outreach templates
- manual tracking
- pipeline status
Immersphere Pro SaaS Responsibility

Immersphere Pro SaaS should eventually handle:

- actual tours
- property previews
- QR destinations
- hosted landing pages
- assets
- analytics
- protected links
- agency/client accounts
- billing and quotas
Temporary MVP

In Phase 4A, the CRM can simulate or locally render the preview before full SaaS integration.

This is acceptable.

The commercial flow is more important than technical perfection at this stage.

9. Future Roadmap
Phase 4A — Real Estate Preview Engine MVP
Real estate only.
Digital postcard.
Private preview.
QR.
Manual tracking.
No automatic sending.
Phase 4B — Proposal Intelligence
Connect audit + score + vertical + missing signals
Generate more specific proposal text
Save generated proposal in the lead
Allow copy/export
Phase 4C — Preview Landing Templates
Improve visual design
Add template variants
Add premium listing mockup
Add CTA blocks
Add shareable preview link
Phase 4D — QR Tracking
Track preview opens
Track QR scans
Track sent/opened/responded status
Show events in lead timeline
Phase 5A — Manual Outreach Assistant
Use existing templates
Select best WhatsApp/email/phone script by vertical and audit
No automatic sending
Log manual actions
Phase 5B — Follow-up Engine
Follow-up 1
Follow-up 2
Objection handling
Reactivation
Next Best Action
Phase 6A — Conversion Intelligence
Track generated previews
Track sent previews
Track opened previews
Track responses
Track meetings
Track proposals
Track won/lost
Phase 6B — Performance Dashboard
Conversion by vertical
Conversion by city
Conversion by source
Conversion by message
Conversion by offer
Conversion by preview type
Phase 7 — Multi-Vertical Expansion

After real estate is validated, activate additional templates:

Hotels
Restaurants
Interior design
Reforms
Awning/outdoor comfort companies
Property administrators
10. Vertical Expansion Rules

A new vertical can only be added when:

- Real estate MVP works end-to-end
- Manual workflow is stable
- Tracking fields are working
- At least one preview template is proven
- Commercial copy is validated
- The CRM remains simple to use

Do not add verticals just because they are interesting.

Add verticals only when the engine is reusable.

11. Compliance & Asset Policy

The system may use public business information for internal/private commercial research and preview generation, but it must stay controlled.

Rules:

- Do not use generated previews as public campaigns without authorization.
- Mark early previews as private/conceptual.
- Replace public or third-party assets with authorized client assets after approval.
- Avoid mass automated outreach in the MVP.
- Keep human review before sending.
- Do not imply false partnership with the business.
- Do not invent factual claims.
- Do not invent business results.

Suggested disclaimer for private previews:

Private conceptual preview. Final materials would be produced with authorized assets, approved images and validated business information.
12. Strategic Positioning

Immersphere is not just a virtual tour tool.

Immersphere should become:

A visual sales infrastructure for businesses that sell spaces, properties, experiences or transformations.

For real estate:

Immersphere helps agencies turn static property listings into interactive sales experiences with tour, QR, video, floorplan and lead capture.

For the CRM:

Immersphere CRM does not only store prospects.
It creates a personalized reason to contact them.
13. Implementation Principle

Build the smallest version that proves the commercial loop.

The MVP is successful if a user can:

1. Open a real estate lead.
2. Run or view the web audit.
3. Generate a preview.
4. See a digital postcard.
5. Open a private landing page.
6. Copy a QR or preview URL.
7. Copy a WhatsApp/email message.
8. Mark the preview as sent.
9. Track response manually.

If those nine steps work, Phase 4A is successful.

14. Acceptance Criteria for Phase 4A

Phase 4A is complete when:

- A new Preview Engine block appears inside real estate lead cards.
- The system generates a personalized diagnosis from the audit.
- The system generates a recommended real estate pack.
- The system generates a digital postcard preview.
- The system creates a private preview URL.
- The system displays a QR.
- The user can copy the URL.
- The user can copy WhatsApp/email outreach.
- The user can mark sent/opened/responded manually.
- The state persists in localStorage or the current CRM persistence layer.
- Existing CRM features are not broken.
- Imported scraper leads still work.
- Website audit 3.1 remains functional.
- crm.html and index.html stay synchronized.
15. Non-Negotiables
Do not break existing CRM phases.
Do not remove previous templates.
Do not simplify full lead cards.
Do not overwrite notes, messages, proposals, budgets or documents.
Do not remove audit fields.
Do not automate sending in Phase 4A.
Do not start with multiple verticals.
Do not build 3D, SLAM or video generation in Phase 4A.
16. Summary

Immersphere Preview Engine is the next strategic layer.

It converts:

Lead intelligence

into:

Personalized visual sales proof

The first version starts with real estate:

Lead inmobiliaria
→ auditoría web
→ propuesta
→ postal digital
→ landing privada
→ QR
→ tracking manual

Once validated, the same engine can serve hotels, restaurants, interior design, reforms, awning companies and property administrators by changing the vertical template.

The focus is one engine, not five products.
