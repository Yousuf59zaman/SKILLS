---
name: upwork-application-pipeline
description: "Run Yousuf's end-to-end Upwork application workflow: discover and rank suitable jobs, show candidates for approval, inspect the approved post and client, map requirements to verified experience, select or build a truthful interactive showcase, prepare public links and Upwork-safe PDF/PNG/CV attachments, create or update relevant portfolio items, write the proposal and screening answers, set realistic budget/milestones/timeline, choose a controlled Connects strategy, fill the logged-in Chrome proposal form, perform final QA, and submit only after explicit approval. Use whenever Yousuf asks to find an Upwork job, review a job, make a proposal, prepare a demo or portfolio for a job, fill an application, rate a proposal, bid/boost, or continue an interrupted Upwork application."
---

# Upwork Application Pipeline

## Overview

Turn a suitable Upwork opportunity into a complete, evidence-backed application while keeping Yousuf in control of job selection, Connects spending, publishing, and final submission. Optimize for trust, relevance, and low client friction rather than generic volume.

Read [references/application-playbook.md](references/application-playbook.md) for the phase-by-phase procedure and [references/quality-checklist.md](references/quality-checklist.md) for proposal, demo, portfolio, and final-review standards.

## Non-Negotiable Gates

1. **Selection gate:** Search and inspect read-only. Show the best candidates with a recommendation. Do not prepare or fill an application until Yousuf approves a specific job, unless he already named the job to apply to.
2. **Claim gate:** Verify project facts, links, role, production status, and confidentiality before using them. Never invent client results, backend functionality, team ownership, metrics, testimonials, or deployment status.
3. **Publish/spend gate:** Get explicit approval before materially spending Connects, publishing a new Upwork portfolio item, or making another meaningful external change that was not already requested.
4. **Submission gate:** Filling and reviewing are not permission to submit. Click the final Upwork **Send/Submit** control only when Yousuf explicitly authorizes submission in the current turn. If he wants to submit himself, leave the reviewed tab open at the final step.
5. **Evidence-relevance gate:** Before adding any optional live site, portfolio highlight, PDF, or image, map it to a named requirement or risk in the current job. The Upwork-safe CV is the only default attachment exception. If the mapping is indirect, generic, or merely reuses a ready artifact from another application, omit it. Use fewer relevant proofs instead of filler, and apply this gate proactively without waiting for Yousuf to correct the selection.

Treat rank and boost position as a live snapshot, never a guarantee. State the exact Connects total before submission.

## Tool and Skill Routing

- Use `$memory` when identity, availability, career history, skills, or project facts would improve the application. Load only the relevant references and verify current evidence.
- Use the Chrome control skill for signed-in Upwork tabs, live search, profile/portfolio edits, application filling, attachments, Connects, and submission. Read that skill before browser actions.
- Prefer signed-in Upwork search for current job/client/competition details. When broader web research is necessary, use the configured web-data provider and cite or save the source.
- Use GitHub or public repositories to verify project evidence when available. If a connector is unavailable, use public pages or the local repository rather than guessing.
- Use both Sites building and Sites hosting skills for a showcase site or app. Reuse an existing `.openai/hosting.json`; never create duplicate Sites projects for the same source.
- Use the PDF skill for proposal/case-study PDFs and the image-generation skill only when a truthful, custom cover or product illustration materially improves the application.
- Inspect output visually: unauthenticated site access, responsive pages, screenshots, PDF renders, and the final Upwork form.

Explicitly tell Yousuf when another skill causes an action or pause.

## Yousuf's Default Application Preferences

Apply these defaults unless the current job or Yousuf's latest instruction calls for a different approach:

- Until Yousuf changes the search brief, favor beginner-friendly jobs with a client budget of at most USD 100. Prefer a small paid trial, bug fix, component, integration, or clearly bounded milestone that can earn a first review; an ongoing 20–25-hour/week role may follow a successful trial.
- Prioritize React, Next.js, TypeScript, Nuxt/Vue, NestJS, Laravel, admin dashboards, SaaS/multi-panel products, CRUD/workflow systems, booking flows, analytics/reporting, authentication, billing, responsive UI, API integration, and existing-codebase debugging. Treat deep Python backend, ML, automation, scraping, or unfamiliar infrastructure as a gap unless current evidence proves the fit.
- Showcase a polished, functional product tailored to the client's work, never a proposal or résumé website. Make visible navigation, buttons, forms, filters, drawers, and modals work; include responsive behavior plus useful validation, feedback, empty, loading, and error states.
- Publish showcase links without owner-only permissions and test the exact public URL from an unauthenticated context before using it. A login-only deployment without reviewer credentials may be secondary evidence, but never the primary showcase.
- Treat `https://leaps-nuxt-dashboard.vercel.app` as Yousuf's default reusable full-stack dashboard proof. Recheck unauthenticated access before every application, then include the exact URL naturally in every future cover letter unless it is unavailable, unsafe, or Yousuf explicitly excludes it. Describe LeAPS as a real OrangeBD public-service project and the linked deployment as Yousuf's independent public read-only reviewer implementation with a Nuxt 4 frontend, NestJS API, Prisma/PostgreSQL data layer, JWT demo session, server-side filters and pagination, analytics, reporting, exports, and role-protected CMS workflows. Do not imply that the linked backend is OrangeBD's production backend or a client-owned deployment. When backend architecture is especially relevant, the public API documentation (`https://leaps-nest-api.vercel.app/api/docs`) may be added only after rechecking it; the frontend URL remains the default client-facing link.
- Treat `https://accessimate-admin-panel-nextjs.vercel.app` as Yousuf's second mandatory reusable full-stack proof under its existing project name, **Accessimate Admin Panel**. Recheck unauthenticated reviewer access before every application, then include the exact URL naturally once in every future cover letter unless it is unavailable, unsafe, or Yousuf explicitly excludes it. Describe it truthfully as a public read-only reviewer-mode portfolio implementation with Next.js 16, React 19, NestJS 11, Prisma/PostgreSQL, separate admin and citizen panels, HttpOnly role sessions, persisted CMS and citizen workflows, real server-side accessibility scans, PDF handling, billing records, and responsive UI. Keep the existing project name, Accessimate product branding, and Vercel URL unchanged; do not present it as **Next.js Multi Panel** or as a client-owned production system.
- Treat `https://heyhomex-next-nest-platform.vercel.app` as Yousuf's third mandatory reusable live proof under the name **HeyHomeX Next + Nest Platform**. Recheck unauthenticated access and the reviewer entry before every application, then include the exact URL once in every future cover letter unless unavailable, unsafe, or explicitly excluded. Explain that Yousuf contributes to OrangeBD's real HeyHomeX platform and that the linked app is his independent full-stack reviewer conversion with Next.js 16, React 19, NestJS 11, Prisma/PostgreSQL, server-owned HttpOnly reviewer sessions, role-based access, property/video search and saved state, leads, tours, subscriptions, and admin/CMS workflows using fictional seeded data. State compactly that it is not OrangeBD's production site, API, backend, or a client-owned deployment. Never use the official OrangeBD HeyHomeX domain or the retired Nuxt reviewer deployment as proposal proof, claim sole ownership, expose private implementation details, or confuse the reviewer deployment with production.
- Treat `https://talentscope-recruiter-platform.vercel.app/dashboard` as Yousuf's mandatory **TalentScope Recruiter Platform** proof in every future cover letter, with public source at `https://github.com/Yousuf59zaman/talentscope-recruiter-platform`. Recheck the exact dashboard URL without an owner session before every application, then include it naturally once unless it is unavailable, unsafe, or Yousuf explicitly excludes it. Connect it truthfully to Yousuf's verified Bdjobs.com contribution: he worked on Talent Search/CV Bank recruiter workflows involving candidate discovery, resume purchase, recruiter tools, and subscription access across Angular frontends and ASP.NET Core services. Describe the linked deployment separately as an independent portfolio-safe reviewer modernization with Next.js 16, React 19, NestJS 11, Prisma 7/PostgreSQL, HttpOnly reviewer sessions, server-side search/filter/sort/facets/pagination, saved filters, shortlists, purchase lists, persistent reviewer comments, generated fictional PDF CVs, transactional single/bulk credit unlocks, analytics, and resettable fictional data. Never call it an official Bdjobs product, a client-owned production system, or a migration/reuse of real candidate data. Add the repository only when code or architecture evidence helps.
- Treat `https://northstar-advisory-consulting.kitgiz-4399.chatgpt.site` as optional proof only for a directly matching one-page business or consulting website that needs the same kind of corporate sections, FAQ, lead form, lightweight motion, semantic HTML, responsive design, or basic SEO. Do not use it for a generic homepage edit, media replacement, React maintenance task, or any job where those implemented workflows are not a named requirement. Recheck unauthenticated access before any permitted use, place it after the mandatory reviewer links as the final URL, describe its branding/content as illustrative, and never imply a real consulting client or business results.
- In every cover letter, place verified professional/reviewer proof before any job-specific ChatGPT Sites proof. Default link order: Accessimate Admin Panel, HeyHomeX Next + Nest Platform, TalentScope Recruiter Platform, LeAPS, then a current job-specific `.chatgpt.site` URL only when the evidence-relevance gate passes. Give each project one concise, truthful relevance sentence. Accessimate, HeyHomeX Next + Nest Platform, TalentScope, and LeAPS are independent reviewer deployments rather than OrangeBD/Bdjobs production systems; disclose that distinction compactly while linking each to Yousuf's verified contribution or portfolio work. Reorder the four reviewer links only when job relevance materially improves clarity. If a `.chatgpt.site` link is justified, keep it last; otherwise omit the job-specific site entirely.
- Always include the latest verified **Upwork-safe CV PDF** exactly once whenever the proposal form permits attachments. Treat it as mandatory, not optional. Confirm that it omits pre-contract contact details; never substitute a normal contact-bearing CV. If attachments are unavailable or the client explicitly prohibits them, record that exception in the ready copy and final report.
- Build the rest of the attachment set from the current requirements matrix. For broadly matching React/dashboard/SaaS work, the proven LeAPS/TalentScope/Accessimate evidence pack is only a candidate pool, not a default upload list. Attach a non-CV file only when it proves a named requirement and record that mapping. For other roles, vary, replace, reduce, or omit non-CV files based on relevance, confidentiality, quality, and Upwork's current file limit. Never add duplicates, filler, or a previous application's bundle merely because it is ready.
- For a small landing-page or business-website application, use Northstar material only when the job specifically needs the workflows it demonstrates. A generic homepage edit, hero-media swap, deployment fix, or narrow React maintenance task does not automatically justify Northstar. Prefer the mandatory safe CV plus zero to three directly mapped work samples.
- Reuse the **complete application structure**, not stale job facts: fill terms, milestone(s), requested screening answers, a tailored cover letter, up to four relevance-ranked portfolio highlights, a verified attachment set, Connects summary, and final QA. Derive the bid, milestone outcome, deadline/due date, duration, availability wording, and every client-facing answer from the current job; never copy an earlier job's date or promise.
- Upwork proposal highlights currently allow four items. For a general React/full-stack application, default to CPIS, LeAPS, HeyHomeX, and Next.js Multi Panel, then reorder or replace items according to the approved job. Promote recruiter/search, accessibility, or other domain-specific proof only when it is more relevant. Do not use the retired Salon Booking project in proposals, attachments, or profile highlights.
- For recruiter, HR-tech, candidate-search, advanced-filtering, or Next.js/NestJS/PostgreSQL roles, promote TalentScope into the four highlights and drop the least-relevant non-domain item.
- For small fixed budgets, define a paid trial or first milestone with a demonstrable outcome rather than promising the entire production scope.
- State Yousuf's verified tenure once in every cover letter using a natural job-relevant sentence such as: `I have 2.5 years of professional software development experience.` Preserve the exact `2.5 years` fact, place it near the opening or fit evidence, and do not repeat it or inflate the duration.
- When currently accurate, use: `I can dedicate 20–25 hours per week on a flexible schedule and provide timely progress updates.` Do not invent fixed daily working hours.
- If a screening question asks about commitments or future part-time availability, answer truthfully that Yousuf works full-time at Orange Business Development and can still provide 20–25 flexible hours per week plus timely progress updates. Do not say he has no other work, and do not volunteer this detail when the client did not ask.
- Prefer the minimum live Connects boost needed for an approved target, including first place, but never spend optional Connects without Yousuf approving the exact boost and total. Never promise that a live rank will hold.
- Before publishing or attaching repository work, verify ownership, license, confidentiality, tracked secrets, private endpoints, and public visibility. Never copy employer/private code into a public repository merely because it is technically accessible.
- Preserve the submission gate: final Send/Submit remains Yousuf's decision unless he explicitly authorizes it in the current turn.

## Operating Workflow

### 1. Establish the Search Brief

Infer current constraints from the conversation and profile: budget ceiling, fixed/hourly preference, technology, availability, competition tolerance, client quality, and desired complexity. Ask only when a missing choice would materially change the search.

Create a durable application folder under the active Upwork workspace:

```text
applications/<yyyy-mm-dd>-<job-slug>/
  job-brief.md
  requirements-matrix.md
  proposal-ready-copy.txt
  portfolio-map.md
  attachments/
  screenshots/
```

Never save credentials, cookies, private messages, contact details, or other secrets there.

### 2. Find and Rank Jobs

Search using multiple focused queries, inspect each promising post, remove duplicates, and reject clear mismatches. Favor strong fit, clear scope, credible client behavior, recent activity, sensible competition, and a budget that supports an honest deliverable.

Show a compact shortlist before doing application work. For each candidate include:

- title and direct job link;
- budget/type, expected duration, required availability, and Connects;
- client/payment/hiring/interview signals visible in Upwork;
- scope summary and must-have stack;
- fit score out of 10, evidence match, gaps, risks, and competition;
- recommendation: apply, watch, or skip.

Wait for job approval.

### 3. Build an Evidence Map

For the approved job, extract every explicit request, screening question, deliverable, timeline, infrastructure need, and hidden risk. Build a traceability matrix:

```text
Requirement | Evidence/project | Proposal sentence | Demo/attachment proof | Gap/mitigation
```

Inspect current repositories, portfolio entries, live sites, screenshots, and memory before choosing examples. Choose two or three highly relevant examples, not the largest possible list.

Before selecting evidence, add one requirements-matrix row per proposed optional URL or non-CV attachment. Name the exact job requirement it proves. Remove any item whose only rationale is broad visual similarity, prior readiness, or reuse from another application.

### 4. Decide Whether to Build a Showcase

Prefer a strong existing product when it proves the requested work. Build or adapt a showcase only when the client requests a sample, existing proof is weak, or an interactive demo will materially reduce perceived risk.

Do not build a showcase for a trivial microtask when the build would be disproportionate to the scope. If no existing or newly justified showcase directly proves the risky requirement, omit the job-specific site instead of substituting a generic demo.

The showcase must be a real product experience, not a proposal website:

- implement the job's critical user journey and relevant role surfaces;
- make visible controls functional; do not leave decorative dead buttons;
- include validation, feedback, empty/loading/error states, and responsive UX;
- use credible sample data and clearly label simulated/demo behavior;
- never present local state, mock APIs, or sample analytics as production infrastructure;
- publish a fresh saved version and verify public access in an unauthenticated context;
- capture clean PNG evidence and create a concise PDF only when useful.

### 5. Prepare Portfolio and Attachments

Match portfolio items to the job rather than using a fixed order. Verify all titles, descriptions, skills, URLs, and screenshots. For private work, use sanitized or illustrative visuals and state the actual contribution without exposing client data. Treat earlier project notes as cautious defaults; current repositories and verified evidence override them.

Locate and verify the latest Upwork-safe CV that omits direct contact details before a contract. Add it exactly once to every proposal that accepts attachments. Check the current Upwork rules in the UI/help content when uncertain. Keep all pre-contract communication and payment on Upwork.

Attachments should complement the proposal:

- the verified Upwork-safe CV PDF (mandatory whenever attachments are supported);
- one short case-study/demo PDF when it adds proof;
- a few high-quality PNGs with distinct evidence;
- no duplicate, broken, confidential, oversized, or irrelevant files.

Except for the mandatory safe CV, every attachment must have a named current-job requirement in the requirements matrix. If no non-CV artifact passes that test, attach only the safe CV.

For React/dashboard/SaaS roles, reuse the verified LeAPS mobile views, TalentScope and Accessimate responsive gallery PDFs, and React dashboard case study when they remain relevant and current. For other jobs, select different proof files while keeping the safe CV mandatory. Respect Upwork's live attachment limit and verify every listed filename after upload.

### 6. Write the Application

Write polished English unless Yousuf requests another language; explain progress to him in Bangla/Banglish when that is his current language.

Write every cover letter from the current post and requirements matrix. Reuse proven structure and truthful evidence, but never reuse another client's opening, scope promise, deadline, milestone wording, question, or unsupported deliverable.

The cover letter should:

1. open with the client's exact outcome or risk;
2. naturally state that Yousuf has 2.5 years of professional software development experience;
3. state the proposed first milestone and what will be demonstrable;
4. include Accessimate Admin Panel, HeyHomeX Next + Nest Platform, TalentScope Recruiter Platform, and LeAPS once each before any job-specific ChatGPT Sites URL, with concise truthful relevance and reviewer/production distinctions;
5. prove fit with two or three verified projects and the actual role;
6. give a realistic phased timeline, budget, availability, and communication plan;
7. answer all requested architecture, infrastructure, support, or team questions;
8. include a job-specific `.chatgpt.site` showcase only when its mapped workflow directly proves a current requirement; when used, place it after the verified reviewer proof and make it the final URL in the cover letter;
9. end with one useful, low-friction question after the final showcase link.

Do not claim a full production platform for an implausibly small fixed price. When necessary, frame the listed budget as a discovery/prototype/first milestone and clearly define what is in and out of scope. Align availability with current facts; do not invent fixed daily work hours. If verified, flexible `20–25 hours/week with timely updates` is acceptable.

Save every field verbatim in `proposal-ready-copy.txt` before filling the browser so work survives a crash or tab reset.

### 7. Set Budget, Milestones, and Connects

Build milestones around client-verifiable outcomes, with dates that agree everywhere: cover letter, form, PDF, demo, and status/sprint plan. Include QA and deployment time. Separate development fees from recurring infrastructure costs when the post asks for both.

Calculate every deadline, due date, delivery window, and project-duration selection anew from the current date, the client's stated target, Yousuf's realistic capacity, and the promised scope. Never carry a previous proposal's date forward.

For Connects:

- refresh the live auction immediately before recommending a boost;
- distinguish the base application cost from optional boost Connects;
- use the minimum reasonable bid for the user-approved target;
- do not chase an unstable rank blindly or promise position number one;
- obtain explicit approval for the exact total before spending when not already authorized.

### 8. Fill, Review, and Hand Off

Fill the already-open Upwork tab when available. Upload the intended files and verify filenames, thumbnail/render, links, amounts, dates, screening answers, profile highlights, and Connects. Confirm that the Upwork-safe CV appears exactly once in the live attachment list. Never rely on a stale screenshot for final totals.

Run the rubric in [references/quality-checklist.md](references/quality-checklist.md), report the score with concrete weaknesses, fix the fixable issues, then re-review. Keep the application tab open at the final confirmation screen.

If Yousuf explicitly says to submit in the current turn, re-read the final totals and then submit. Otherwise stop before the irreversible click and tell him exactly what remains.

### 9. Recover an Interrupted Application

When Chrome or the PC restarts:

1. inspect the current Upwork proposal tab and submission status;
2. reopen the durable application folder;
3. compare the current form against `proposal-ready-copy.txt`;
4. restore fields and attachments without duplicating published items;
5. repeat live Connects and final QA checks;
6. preserve the same submission gate.

## Definition of Done

The workflow is complete only when the approved scope has:

- a verified job/client brief and requirements matrix;
- truthful, job-specific proof;
- a public, unauthenticated showcase link when used;
- tested PDF/PNG/CV attachments when used;
- a complete proposal, screening answers, budget, milestones, and dates;
- a documented Connects total and live rank snapshot;
- a final QA score and resolved material errors;
- an explicit status of **prepared for Yousuf to submit** or **submitted after explicit approval**.
