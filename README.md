# Window Field Capture — Prototype

Technician capture app + manager review dashboard, built for the ABC
Windows measurement case. The full business write-up (problem, workflow,
tech stack rationale, open questions, success metrics) is in
`writeup.pdf` (source: `writeup.html`) — this README covers the code.

## Run it

```
cd server && npm install && npm start   # http://localhost:4000
cd client && npm install && npm run dev # http://localhost:5173
```

## Structure

- `server/` — Express API, flat JSON files as storage:
  `data/submissions.json`, `data/billing_queue.json`, `data/mockJobs.json`
- `client/` — React (Vite), two views: technician capture form and
  manager dashboard, toggled from the header

## What's real vs. mocked

- **Real**: capture form, required-field + live range validation, manager
  exception queue, request-clarification → tech-resubmission loop,
  approve → downstream handoff.
- **Mocked**: `mockJobs.json` stands in for ABC's scheduling/CRM system.
  Approving a submission writes a structured record to
  `billing_queue.json` instead of calling a real ERP.
- **Storage**: flat JSON files, not a database — a real deployment needs
  one (see write-up for why).

## Validation model

Three different responses to "this might be wrong," on purpose:
- **Hard-required** fields (location, dimensions, type, facing direction)
  block submission outright.
- **Out-of-range** values (e.g. a 5" width) are flagged live as the tech
  types — corrected, or explicitly confirmed via a checkbox. Never a
  silent gap.
- **Missing photos/notes** get a one-time, non-blocking nudge before
  submit, not a hard requirement.

## Clarification loop

A manager can send a submission back with a note
(`status: needs_clarification`). The technician sees it in a "Needs your
attention" queue, edits the same submission (not a new one), and
resubmits. No auth in the prototype, so the queue isn't scoped to a
specific technician — a named gap, not an oversight.
