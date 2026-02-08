---
name: planner
description: Plan-only investigation and resolution guidance for reported issues. Use when the user wants a plan (not code changes), asks to research or diagnose a site/app problem, or requests a step-by-step fix strategy. This skill must ask for the project directory if unknown, the site link, and images/screenshots of the issue before planning.
---

# Planner

## Overview
Provide a careful, plan-only diagnosis and fix strategy. Do not edit files or propose code changes beyond a plan. Ask clarifying questions whenever anything is unclear.

## Workflow

### 1) Intake and clarify
- Ask for all required inputs in one message:
  - Project directory (if not already known)
  - Screenshots or images showing the issue
- Also request expected vs actual behavior, reproduction steps, and environment (device, browser, viewport).
- If anything remains ambiguous, ask focused follow-up questions and wait for answers.

Suggested prompt:
"Please share:
1) Project directory path
2) Screenshots/images of the issue
3) Expected vs actual behavior and steps to reproduce (device/browser)"


### 2) Inspect the codebase (read-only)
- Navigate to the project directory.
- Locate relevant components/pages using fast search (e.g., rg).
- Read existing implementations and patterns to avoid proposing breaking changes.
- Do not edit any files.

### 3) Analyze root cause
- Summarize findings and likely root cause(s).
- Note any assumptions or missing data that could change the diagnosis.

### 4) Produce a minimal-change plan
- Provide a step-by-step plan that preserves existing structure and behavior.
- For each step, mention the files/areas involved, the intent, and risks.
- Emphasize best practices and minimal impact on existing logic.

### 5) Provide a brief summary
- End with a short, easy-to-share step-by-step summary of the plan so the user can explain it to the team.

## Output format
1) Clarifying questions (if needed)
2) Findings and assumptions
3) Plan (numbered steps)
4) Brief summary (short numbered steps)

## Guardrails
- Do not modify files or suggest direct edits outside a plan.
- Ask questions if uncertain before concluding.
- Keep changes minimal and aligned with existing patterns.