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

Create a requirement-to-proof mapping before selecting any optional live site or non-CV attachment. The safe CV is the only attachment that does not need a per-job feature mapping. Reject evidence whose rationale is only that it is visually polished, already deployed, or was used in the previous application.

For Yousuf's future cover letters, the mandatory reviewer-link sequence is Accessimate Admin Panel, HeyHomeX Next + Nest Platform, TalentScope Recruiter Platform, and LeAPS. Keep each explanation concise, verify each exact public URL, and place any job-specific `.chatgpt.site` link after them as the final URL. Reorder the four reviewer links only when the current job's relevance materially improves clarity.

Use `https://leaps-nuxt-dashboard.vercel.app` as the default reusable dashboard link after confirming that it opens publicly without Yousuf's session. Include it in every future cover letter unless unavailable, unsafe, or explicitly excluded. Place it in the verified real/OrangeBD-related proof block before any job-specific ChatGPT Sites link:

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

Position Accessimate Admin Panel before any job-specific ChatGPT Sites sample. Do not rename the project or public site. Do not conflate it with the separate **Next.js Multi Panel** project or imply that the reviewer deployment is a client-owned production system.

Use `https://heyhomex-next-nest-platform.vercel.app` once in every future cover letter after confirming unauthenticated public access and the reviewer entry. Place it after Accessimate Admin Panel and before TalentScope by default:

```text
HeyHomeX Next + Nest Platform: https://heyhomex-next-nest-platform.vercel.app
I contribute to OrangeBD's real HeyHomeX platform. This independent full-stack reviewer conversion uses Next.js 16, React 19, NestJS 11, Prisma, and PostgreSQL to demonstrate HttpOnly reviewer sessions, role-based property/video search and saved state, leads, tours, subscriptions, and admin/CMS workflows with fictional seeded data.
```

Keep the HeyHomeX explanation concise. State that the Vercel deployment is Yousuf's independent full-stack reviewer conversion, not OrangeBD's production site/API/backend or a client-owned deployment. Do not use the official OrangeBD HeyHomeX domain or the retired Nuxt reviewer deployment, claim sole ownership, expose private backend details, or use another similarly named domain.

Use [TalentScope Recruiter Platform](https://talentscope-recruiter-platform.vercel.app/dashboard) once in every future cover letter after confirming that the exact dashboard URL opens publicly without Yousuf's session. Place it after HeyHomeX Next + Nest Platform and before LeAPS by default. Use the public repository (`https://github.com/Yousuf59zaman/talentscope-recruiter-platform`) only when source or architecture proof will help:

```text
TalentScope Recruiter Platform: https://talentscope-recruiter-platform.vercel.app/dashboard
At Bdjobs.com, I contributed to Talent Search/CV Bank recruiter workflows involving candidate discovery, resume purchase, recruiter tools, and subscription access through Angular and ASP.NET Core. TalentScope is my separate independent reviewer modernization with Next.js 16, NestJS 11, Prisma 7, and PostgreSQL; it demonstrates server-side candidate search, filters, facets, pagination, saved filters, shortlists, purchase lists, persistent comments, generated fictional PDF CVs, transactional single/bulk contact unlocks, analytics, and resettable fictional data.
```

Never describe TalentScope as an official Bdjobs deployment, reuse/migration of real candidate data, or a client-owned production system. Keep the verified Bdjobs contribution and the independent reviewer implementation clearly separate.

### Personal project cautions

Treat these as cautious defaults and re-verify before each use:

- CPIS and other employer/client systems may require sanitized visuals and precise contribution language.
- LeAPS may be described as a verified Nuxt 4 + NestJS + Prisma/PostgreSQL full-stack portfolio implementation in public read-only reviewer mode; never present it as OrangeBD's production backend or a client-owned production system.
- Accessimate Admin Panel is the verified public reviewer deployment at `https://accessimate-admin-panel-nextjs.vercel.app`; its existing name, product branding, and URL stay unchanged.
- TalentScope Recruiter Platform is the verified public reviewer deployment at `https://talentscope-recruiter-platform.vercel.app/dashboard`, with public source at `https://github.com/Yousuf59zaman/talentscope-recruiter-platform`; use its independent branding and fictional-data disclosure, and distinguish it from Yousuf's real Bdjobs Talent Search/CV Bank contribution.
- Next.js Multi Panel public status, repository, features, and live links must be checked before claiming it.
- Northstar Advisory is optional proof at `https://northstar-advisory-consulting.kitgiz-4399.chatgpt.site` only when the current job explicitly needs the same consulting/business one-page sections, FAQ, lead form, semantic/responsive implementation, motion, or basic SEO. It is not proof for a generic homepage edit, hero-video replacement, deployment fix, or unrelated React maintenance task. Describe its brand and content as illustrative, never claim real consulting-client results, and make it the final URL only when the relevance gate passes.
- Salon Booking is retired and must not be used or recommended in future proposals, attachments, or highlight selections.
- HeyHomeX Next + Nest Platform is Yousuf's independent full-stack reviewer conversion at `https://heyhomex-next-nest-platform.vercel.app`, based on his contribution to OrangeBD's real HeyHomeX platform. It uses Next.js 16, React 19, NestJS 11, Prisma/PostgreSQL, HttpOnly reviewer sessions, role-based access, and fictional seeded data. Verify public access and reviewer entry before each use, keep the non-production distinction explicit, and never use the official OrangeBD domain or retired Nuxt reviewer URL as proposal proof.

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

Do not build a bespoke demo for a trivial microtask when its cost and complexity exceed the client's requested scope. If neither an existing product nor a proportionate new demo directly proves the risky requirement, use no job-specific site.

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
- HeyHomeX for verified multi-role real-estate product contributions, with confidentiality and ownership stated precisely;
- Accessimate Admin Panel (`https://accessimate-admin-panel-nextjs.vercel.app`) for a verified public Next.js/NestJS admin-and-citizen experience, persisted workflows, role sessions, server-side accessibility scanning, PDF handling, billing records, and responsive UI;
- TalentScope Recruiter Platform (`https://talentscope-recruiter-platform.vercel.app/dashboard`) for verified recruiter/HR-tech workflows, advanced server-side talent search, saved filters, shortlists, purchase lists, persistent comments, fictional PDF CV generation, transactional single/bulk profile unlocks, analytics, and a Next.js/NestJS/Prisma/PostgreSQL architecture;
- Next.js Multi Panel for reusable admin/citizen panels, CRUD, analytics, authentication, billing, and API-driven UI;
- Northstar Advisory for one-page business sites, consulting/landing pages, HTML/CSS, responsive design, basic SEO, motion, FAQ, and validated lead-form proof;
- verified Bdjobs projects when the role benefits from Angular, recruitment workflows, production maintenance, or large data interfaces.

If five projects are relevant, use the strongest four as highlights and place the fifth only in supporting copy. Do not publish, rename, or fabricate an entry merely to fill the limit.

Use these tie-breakers:

- General React/full-stack: CPIS, LeAPS, HeyHomeX, Next.js Multi Panel.
- Landing page/business web design: feature Northstar only when its implemented corporate sections, FAQ, form, motion, responsive design, or SEO directly match the post. Do not use it automatically for every homepage task. Then choose the four strongest existing profile items without using Salon Booking.
- Nuxt/Vue/dashboard/analytics: include LeAPS and drop the weakest non-domain match.
- Recruiter/HR-tech/search: promote TalentScope and drop the weakest non-domain match.
- Treat public repositories and deployments as stronger only after checking access, license, secrets, and confidentiality.

### Default attachment bundle

Whenever the proposal accepts attachments, include the latest verified Upwork-safe CV PDF exactly once. It is the mandatory anchor file. Select every other file for the current job.

For broadly matching React/dashboard/SaaS work, prefer this proven full evidence pack when all files remain current, safe, and relevant:

1. five distinct LeAPS responsive mobile PNGs;
2. the TalentScope responsive mobile gallery PDF;
3. the Accessimate responsive mobile gallery PDF;
4. one concise React/dashboard case-study PDF;
5. the verified Upwork-safe CV PDF.

For a narrower or different role, reduce or replace any non-CV item with more relevant evidence. The CV remains mandatory unless the form has no attachment feature or the client explicitly disallows attachments. Respect the current Upwork file limit, avoid duplicates and filler, and verify every filename in the live form.

For every selected non-CV file, record `filename -> named current-job requirement` in the application folder before upload. If the mapping cannot be stated plainly, omit the file. Never copy an earlier attachment bundle wholesale.

## F. Application Writing

### Cover-letter skeleton

```text
Hi <name if known>,

<1–2 lines naming the client's exact outcome/risk and the practical approach.>

I have 2.5 years of professional software development experience, with relevant strength in <job-specific stack/outcome>.

<role-appropriate Accessimate Admin Panel line with https://accessimate-admin-panel-nextjs.vercel.app>
<role-appropriate HeyHomeX Next + Nest Platform line with https://heyhomex-next-nest-platform.vercel.app>
<role-appropriate TalentScope line with https://talentscope-recruiter-platform.vercel.app/dashboard>
<role-appropriate LeAPS line with https://leaps-nuxt-dashboard.vercel.app>

For the first milestone, I will deliver <specific demonstrable outcome>.

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

<when used: job-specific ChatGPT Sites explanation and final URL>

<one useful clarification question>

Best,
Yousuf
```

Keep the opening specific enough that it cannot be pasted onto an unrelated job. Include the `2.5 years` tenure once, tailored naturally to the role; do not repeat it or inflate the duration. Avoid clichés, oversized biography, keyword stuffing, and unsupported superlatives.

Before saving the ready copy, verify that the exact Accessimate Admin Panel, HeyHomeX Next + Nest Platform, TalentScope dashboard, and LeAPS URLs each appear once and open publicly. Default to those four verified professional/reviewer proofs. Include a generated or job-specific site only when its exact workflow has a current requirement mapping; otherwise omit it. If a `.chatgpt.site` link is used, make it the final URL in the cover letter and follow it only with prose such as the closing question and sign-off. Do not repeat any URL.

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
Requirement mapping for every optional live site and every non-CV attachment
Base Connects
Boost Connects
Total Connects
Last live-check time
Submission status
```

This file is the recovery source after browser or PC interruption.

Store deadlines and due dates as current-job values, never reusable defaults. Store the absolute path of the verified Upwork-safe CV and mark whether it is visibly attached exactly once.

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
