# Application Playbook

Use this reference for the detailed execution sequence. Adapt it to the job; do not force every artifact into every application.

## A. Search and Approval

### Search brief

Capture:

- target role/stack and excluded work;
- fixed-price or hourly preference;
- client budget ceiling/floor and whether a small budget may represent a trial;
- desired weekly capacity and delivery window;
- minimum client quality signals;
- maximum acceptable competition/interview activity;
- whether a sample is required;
- current Connects budget.

Do not hardcode constraints from an older application. The latest user request wins.

When no newer instruction overrides it, use Yousuf's current starter brief:

- client budget at most USD 100;
- fixed-price paid trials and small milestones first, with credible ongoing work as a bonus;
- React/Next.js/TypeScript, Nuxt/Vue, NestJS, Laravel, dashboards, SaaS panels, CRUD/workflows, booking, analytics/reporting, auth/billing, responsive UI, API integration, and existing-codebase fixes;
- avoid deep Python backend, ML, scraping, and vague full-platform builds unless verified evidence and scope support them.

### Candidate score

Score each job from 0–10:

| Dimension | Weight |
|---|---:|
| Direct skills and domain match | 2.5 |
| Evidence/portfolio match | 2.0 |
| Scope clarity and feasibility | 1.5 |
| Budget-value alignment | 1.5 |
| Client quality/payment/hiring signals | 1.0 |
| Competition and freshness | 1.0 |
| Strategic value/ongoing potential | 0.5 |

Apply a visible penalty for major gaps, unrealistic deadlines, unpaid-test language, off-platform requests, vague production scope at token budget, or suspicious client behavior.

### Approval card

```text
Job: <title>
Link: <direct URL>
Budget/type: <amount and fixed/hourly>
Duration/availability: <what the post actually says>
Client signals: <payment, spend, hire rate, reviews, location, visible activity>
Competition: <proposals/interviews/invites/last viewed>
Connects: <base cost; boost not yet authorized>
Why it fits: <2–3 verified reasons>
Risks/gaps: <honest constraints>
Fit: <x/10>
Recommendation: Apply / Watch / Skip
```

Show the shortlist and wait for selection.

## B. Approved-Job Analysis

Save the exact post URL and visible job text. Separate:

- required outcomes;
- required technologies;
- requested proposal sections;
- screening questions;
- deliverables and acceptance criteria;
- timeline and availability;
- engagement type and budget;
- ongoing-support expectations;
- intellectual-property, privacy, compliance, and infrastructure concerns.

Translate each into the requirements matrix. A requirement with no evidence needs an honest plan, question, or scope boundary—not a fabricated credential.

## C. Proof Strategy

Evaluate proof in this order:

1. verified live product with relevant workflow;
2. public repository with relevant implementation;
3. sanitized private-project case study;
4. interactive purpose-built demo;
5. illustrative cover image only.

Do not equate an image with a functional project.

Choose the smallest proof set that tells a coherent story. A strong set normally has:

- one closest domain/product match;
- one architecture or complex-dashboard match;
- one secondary implementation proof.

Use `https://leaps-nuxt-dashboard.vercel.app` as the default reusable dashboard link after confirming that it opens publicly without Yousuf's session. Include it in every future cover letter unless unavailable, unsafe, or explicitly excluded. For Nuxt/Vue/dashboard/analytics roles, introduce it early as the closest live sample. Otherwise, keep the job-specific sample primary and add LeAPS as concise secondary proof:

```text
Additional dashboard sample: https://leaps-nuxt-dashboard.vercel.app
This public read-only reviewer-mode full-stack portfolio build uses Nuxt 4, NestJS, Prisma, and PostgreSQL, with JWT access, server-side filters, analytics, reporting, exports, and role-protected CMS workflows.
```

Adjust the first label to `Relevant Nuxt/NestJS dashboard sample` when it directly matches the job. Describe LeAPS as a full-stack portfolio implementation, not as OrangeBD's production backend or a client-owned production system. When backend architecture is central, optionally add `API documentation: https://leaps-nest-api.vercel.app/api/docs` only after rechecking public access; do not clutter unrelated proposals with it.

Use `https://accessimate-admin-panel-nextjs.vercel.app` as the second mandatory reusable link in every future cover letter after confirming public reviewer access. Keep its existing project name, **Accessimate Admin Panel**:

```text
Additional Next.js/NestJS sample: https://accessimate-admin-panel-nextjs.vercel.app
Accessimate Admin Panel is a public read-only reviewer-mode full-stack portfolio build with Next.js 16, React 19, NestJS 11, Prisma/PostgreSQL, separate admin and citizen panels, persisted workflows, server-side accessibility scans, PDF handling, billing records, and responsive UI.
```

Position Accessimate Admin Panel early for React/Next.js/NestJS/admin/citizen-panel/API roles and keep it concise after the job-specific sample for other roles. Do not rename the project or public site. Do not conflate it with the separate **Next.js Multi Panel** project or imply that it is a client-owned production system.

Use [TalentScope Recruiter Platform](https://talentscope-recruiter-platform.vercel.app) as a primary sample for recruiter, HR-tech, CV-bank, advanced-search, or directly matching Next.js/NestJS/Prisma/PostgreSQL work. Recheck public reviewer access first. Use the public repository (`https://github.com/Yousuf59zaman/talentscope-recruiter-platform`) only when source or architecture proof will help:

```text
Relevant recruiter-platform sample: https://talentscope-recruiter-platform.vercel.app
TalentScope is an independent full-stack portfolio modernization built with Next.js 16, NestJS 11, Prisma 7, and PostgreSQL. Its public reviewer mode demonstrates server-side candidate search, filters, facets, pagination, saved filters, shortlists, purchase lists, persistent reviewer comments, generated PDF CVs, transactional single/bulk contact unlocks, analytics, and resettable fictional data.
```

Never describe TalentScope as an official Bdjobs deployment, reuse of real candidate data, or a client-owned production system. Keep it out of unrelated proposals instead of adding another generic link.

### Personal project cautions

Treat these as cautious defaults and re-verify before each use:

- CPIS and other employer/client systems may require sanitized visuals and precise contribution language.
- LeAPS may be described as a verified Nuxt 4 + NestJS + Prisma/PostgreSQL full-stack portfolio implementation in public read-only reviewer mode; never present it as OrangeBD's production backend or a client-owned production system.
- Accessimate Admin Panel is the verified public reviewer deployment at `https://accessimate-admin-panel-nextjs.vercel.app`; its existing name, product branding, and URL stay unchanged.
- TalentScope Recruiter Platform is the verified public reviewer deployment at `https://talentscope-recruiter-platform.vercel.app`, with public source at `https://github.com/Yousuf59zaman/talentscope-recruiter-platform`; use its independent branding and fictional-data disclosure.
- Next.js Multi Panel and Salon Booking public status, repositories, features, and live links must be checked before claiming them.
- HeyHomex role, production status, and confidentiality must be verified from current evidence.

## D. Showcase Decision and Build

### Existing project is enough when

- its main workflow directly matches the client's request;
- it is accessible and visually credible;
- the relevant functionality works;
- the user's role can be accurately explained.

### Build or adapt a demo when

- the client explicitly asks for a sample;
- no existing project proves the risky part of the job;
- a small interactive slice will make the approach obvious;
- there is time to test and publish it properly.

### Demo scope

Implement the highest-risk workflow, not an entire imaginary company. For example:

```text
Landing/catalog → authentication/role entry → core workflow → dashboard/state change → admin control
```

For a course platform, useful proof may include catalog/filter, course detail, subscription selection, lesson player/progress, quiz/certificate state, instructor content builder, and admin analytics. Clearly distinguish simulated media/payment state from real HLS, DRM, billing webhooks, or production authorization.

### Interaction audit

Create an inventory of visible interactions and test each:

```text
Page | Control | Expected action | Observed action | Status | Fix
```

Test navigation, forms, filters, search, modals, dropdowns, table actions, role changes, responsive layout, empty/error states, persistence, and keyboard/focus behavior. No unexplained dead control may remain on a showcased path.

### Public access audit

- deploy only a saved Sites version;
- confirm deployment is terminal/successful;
- open the exact URL without the creator session;
- ensure no permission request or login wall appears;
- retest main paths on desktop and mobile;
- use that exact public URL in the proposal and PDF.

## E. Portfolio Workflow

For each relevant portfolio entry:

1. verify the project name, role, dates, source/live URLs, and confidentiality;
2. write an outcome-led title and truthful short description;
3. list the actual stack and no more skills than the UI permits;
4. use clean media with no confidential data or false production claims;
5. preview before publishing;
6. publish/reorder only when requested or explicitly approved;
7. select the most relevant proposal highlights, respecting the current UI limit.

Do not force a fixed profile order into every proposal. Proposal highlights should be relevance-first.

### Yousuf's preferred proof pool

Choose no more than four Upwork proposal highlights and rank them by the approved job:

- CPIS for enterprise workflows, forms, validation, reporting, and admin UI;
- LeAPS for Nuxt/Vue/Tailwind dashboards, NestJS APIs, Prisma/PostgreSQL, analytics, reporting, and role-aware workflows, described precisely as a public full-stack portfolio implementation;
- HeyHomex for verified multi-role real-estate product contributions, with confidentiality and ownership stated precisely;
- Accessimate Admin Panel (`https://accessimate-admin-panel-nextjs.vercel.app`) for a verified public Next.js/NestJS admin-and-citizen experience, persisted workflows, role sessions, server-side accessibility scanning, PDF handling, billing records, and responsive UI;
- TalentScope Recruiter Platform (`https://talentscope-recruiter-platform.vercel.app`) for verified recruiter/HR-tech workflows, advanced server-side talent search, saved filters, shortlists, purchase lists, persistent comments, PDF CV generation, transactional single/bulk profile unlocks, analytics, and a Next.js/NestJS/Prisma/PostgreSQL architecture;
- Next.js Multi Panel for reusable admin/citizen panels, CRUD, analytics, authentication, billing, and API-driven UI;
- Salon Booking for Next.js/NestJS/PostgreSQL full-stack booking workflows;
- verified Bdjobs projects when the role benefits from Angular, recruitment workflows, production maintenance, or large data interfaces.

If five projects are relevant, use the strongest four as highlights and place the fifth only in supporting copy. Do not publish, rename, or fabricate an entry merely to fill the limit.

Use these tie-breakers:

- General React/full-stack: CPIS, HeyHomex, Next.js Multi Panel, Salon Booking.
- Nuxt/Vue/dashboard/analytics: include LeAPS and drop the weakest non-domain match.
- Booking/appointments: promote Salon Booking from the normal fourth/last position.
- Recruiter/HR-tech/search: promote TalentScope and drop the weakest non-domain match.
- Treat public repositories and deployments as stronger only after checking access, license, secrets, and confidentiality.

### Default attachment bundle

When the form and job justify attachments, prefer this four-file pack:

1. one concise, job-specific case-study or demo PDF;
2. one clean overview PNG showing the main product workflow;
3. one distinct PNG showing interaction depth, validation, error/retry, analytics, or a role-specific state;
4. the current verified Upwork-safe CV PDF.

Use fewer than four when an item adds no proof, and exceed four only for a clear job-specific reason. The bundle is evidence, not decoration. Avoid direct contact details, duplicate views, private client data, mock results presented as production, or files that merely repeat the cover letter.

## F. Application Writing

### Cover-letter skeleton

```text
Hi <name if known>,

<1–2 lines naming the client's exact outcome/risk and the practical approach.>

I have 2.5 years of professional software development experience, with relevant strength in <job-specific stack/outcome>.

For the first milestone, I will deliver <specific demonstrable outcome>.
Relevant interactive sample: <public link>
<role-appropriate LeAPS line with https://leaps-nuxt-dashboard.vercel.app>
<role-appropriate Accessimate Admin Panel line with https://accessimate-admin-panel-nextjs.vercel.app>
<when relevant: TalentScope line with https://talentscope-recruiter-platform.vercel.app>

Why I fit:
• <verified project + exact contribution + relevance>
• <verified project + exact contribution + relevance>
• <optional third proof>

Approach:
1. <phase/outcome>
2. <phase/outcome>
3. <phase/outcome>

Timeline and communication:
<realistic duration, weekly availability if requested, staging/update cadence>

Budget/scope:
<what the submitted amount includes; exclusions or recurring costs>

<one useful clarification question>

Best,
Yousuf
```

Keep the opening specific enough that it cannot be pasted onto an unrelated job. Include the `2.5 years` tenure once, tailored naturally to the role; do not repeat it or inflate the duration. Avoid clichés, oversized biography, keyword stuffing, and unsupported superlatives.

Before saving the ready copy, verify that the exact LeAPS URL and the exact Accessimate Admin Panel URL each appear once, open publicly, and are positioned according to relevance. Do not repeat either URL in multiple sections of the same cover letter.

### Screening answers

Answer the question first. Then add evidence and constraints. Do not reuse a generic availability statement if the client asks a different question.

For future or ongoing availability, prefer:

```text
I can dedicate 20–25 hours per week on a flexible schedule and provide timely progress updates.
```

Use only if currently true. Mention employment only when relevant to transparency or when directly asked; do not volunteer distracting scheduling detail.

If the client directly asks about current employment, other commitments, or future part-time availability, state that Yousuf works full-time at Orange Business Development and can provide 20–25 hours per week on a flexible schedule with timely updates. Do not claim an empty workload and do not invent fixed daily hours.

### Architecture and estimates

If the post asks for architecture:

- recommend frontend, backend, database, auth, media/storage/CDN, billing, hosting, queues, observability, and deployment;
- explain why each choice fits performance, security, cost, and maintainability;
- distinguish MVP from production hardening;
- describe entitlement, webhook, retry, revocation, and reconciliation logic;
- state recurring infrastructure separately from development fees;
- label estimates and their usage assumptions.

Verify current vendor pricing and platform capabilities before quoting exact costs.

## G. Durable Ready Copy

Before browser entry, store:

```text
Job URL
Job title
Profile
Terms: fixed/hourly
Bid or hourly rate
Milestones and due dates
Estimated duration
Cover letter
Screening answers
Portfolio highlights
Attachments with absolute paths
Public demo URLs
Base Connects
Boost Connects
Total Connects
Last live-check time
Submission status
```

This file is the recovery source after browser or PC interruption.

## H. Browser Filling and Submission

Use the existing signed-in tab when possible. Fill one section at a time and verify the visible result. For uploads, wait for each file to finish and inspect the listed filename.

Before final handoff:

- refresh live job/auction data;
- check whether the client has hired, closed, or materially changed activity;
- recompute total Connects;
- confirm bid, milestones, and availability;
- open every link from the entered proposal;
- verify attachments and portfolio selections;
- reread the final rendered form.

If there is no current-turn authorization to submit, stop at the last reversible point. If authorized, state the exact final amount/Connects, submit once, and verify the confirmation state. Never double-submit after a timeout; inspect status first.

## I. Final Report

Report:

- job and direct link;
- proposal status;
- submitted rate/budget and milestones;
- timeline/availability;
- public demo link;
- portfolio examples and attachments;
- base, boost, and total Connects;
- live rank snapshot with timestamp and non-guarantee note;
- QA score and any residual caveat;
- next action, if any.
