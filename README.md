# Window Field Capture — Prototype

Demonstrates the core fix for the ABC Windows measurement workflow: bad or
incomplete data can't leave the job site, and the manager→billing handoff
becomes a structured payload instead of a re-typed paper form.

## Run it

```
cd server && npm install && npm start   # http://localhost:4000
cd client && npm install && npm run dev # http://localhost:5173
```

## What's real vs. mocked

- **Real**: React field-capture form, required-field + live range
  validation, Express API, manager exception queue, request-clarification →
  tech-resubmission loop, approve → billing handoff.
- **Mocked**: `server/data/mockJobs.json` stands in for the scheduling/CRM
  system that would normally supply job metadata. `billing_queue.json`
  stands in for the customer's ERP — approving a submission writes a
  structured record there instead of calling a real API, since there's no
  live system to integrate with in a prototype.
- **Storage**: flat JSON files, not a database — swapped for Postgres/their
  existing DB in a real deployment.

## Default window checklist

Since the exact fields ABC's techs track weren't specified, the prototype
hardcodes a standard set: location/room, width/height/depth, window type,
facing direction, quantity, notes, and photos. In a real engagement this
would come from the manager's actual field-capture template on day one.

## Validation model

Two different kinds of "this looks wrong," handled differently on purpose:

- **Hard-required fields** (location, dimensions, type, facing direction)
  block submission — these can never be missing, full stop.
- **Out-of-range dimensions** (e.g. a 5" width) are flagged *live*, in the
  field, as the tech types — not after the fact. The tech either corrects
  the number or explicitly checks "I've double-checked, this is correct,"
  which is what actually unblocks submission. Either way the manager never
  has to guess whether an odd number was a typo.
- **Photos and notes are optional**, not required — forcing a photo upload
  mid-visit can be more friction than it's worth. Instead, if a window has
  neither, the tech sees a one-time nudge ("anything else to add?") before
  they can submit, so skipping detail is a deliberate choice, not an
  oversight.
- **Tech-flagged uncertainty**: a technician can mark any window "not
  confident" with an optional note, which routes it into the manager's
  exception queue alongside system-detected anomalies.

## Clarification loop

If the manager needs something fixed (not just approved), "Request
Clarification" attaches a note and moves the submission to
`needs_clarification`. The technician sees it in a "Needs your attention"
queue, edits the existing submission (not a new one), and resubmits — which
puts it back in the manager's queue with the clarification history attached.

This is scoped intentionally narrow: no auth/login, so any technician can
see any job's clarification queue, and there's no push notification — the
tech has to check the app. Both are reasonable v1 gaps to name explicitly
rather than build out, given the timeline.

This loop maps directly to the original process's "manager notifies tech,
requests a second trip" step — it isn't eliminated by validation, because a
manager can still judge a technically-valid submission as wrong (unclear
room label, a measurement that's in-range but still off). The distinction
worth making explicit: in this workflow, "clarification" no longer implies
"drive back to the site." Most clarifications are corrections to notes,
labels, or a re-entered number the tech can fix from wherever they are;
only a genuine re-measurement requires physically returning. The original
process couldn't tell those apart — every miss meant a second trip. This
one can.

## What I'd build next (not prototyped, worth naming)

- **Dynamic per-job checklist**: the job metadata already flows into the
  form (customer, address, tech) — extending `mockJobs.json` with a
  `checklistTemplate` field is a natural next step, so e.g. replacement jobs
  and new-construction jobs pull different required fields (egress
  requirements for bedroom windows, HOA color codes, etc.) instead of one
  fixed default set for every job.
- **"When in doubt" field guidance**: lightweight in-app reference for
  techs — how to measure a rough opening vs. a finished opening, common
  mistakes, example photos — surfaced contextually rather than requiring a
  phone call back to the office. Content-authoring heavy (needs real
  domain input from ABC), so scoped as a future addition rather than built
  here.

- **Offline-first PWA sync**: job sites often have poor or no signal.
  Service worker + local queue + background sync once connectivity
  returns — a well-understood pattern, doesn't depend on ABC's specifics,
  scoped out here only for time.
- **CV-assisted measurement from photos**: shown *alongside* manual entry
  as a cross-check, not a replacement for the tape measure — flagged if
  the two disagree significantly, same "flag, don't silently trust"
  pattern as the range validation. Worth naming honestly: reliable
  real-world measurement from a photo needs a calibration reference (a
  card or marker of known size in frame); without one, accuracy isn't
  production-grade yet.

## Open questions for the client (not guessed at)

- **Structured clarification reasons.** Right now "Request Clarification"
  is a free-text note. A manager will use this dozens of times a day —
  presets ("re-measure width," "add a photo," "unclear location") would cut
  typing and make the request machine-readable (e.g. auto-highlight the
  specific field on the tech's screen). Not designed here because it
  depends on how ABC's managers actually phrase requests today.
- **Clarification severity.** Some clarifications are a data fix (tech
  re-enters a number from memory or a photo they already took); others
  require a real site revisit (tech never captured that measurement at
  all). Whether the manager should be able to explicitly flag "this needs
  a revisit" — and whether that should route differently (e.g. into a
  scheduling system) — is a real workflow question, not one to guess at
  without talking to ABC about how second trips get scheduled today.
- **Fully autonomous approval** (skip the manager click for flag-free
  submissions): a risk-tolerance and policy decision for ABC to make, not
  a technical one — covered earlier in this doc, repeated here as it
  belongs in the same bucket as the two above.
- **Inventory optimization**: real-time structured order data is the
  prerequisite this prototype provides, but the optimization itself
  (safety stock levels, supplier lead times, batching) depends entirely
  on ABC's actual inventory/production system and policies.
