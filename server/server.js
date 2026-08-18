import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const BILLING_FILE = path.join(DATA_DIR, "billing_queue.json");
const MOCK_JOBS_FILE = path.join(DATA_DIR, "mockJobs.json");

const WINDOW_TYPES = ["Double-Hung", "Casement", "Slider", "Picture", "Awning", "Bay/Bow"];
const FACING_DIRECTIONS = ["North", "South", "East", "West"];

const RANGES = {
  widthIn: [6, 120],
  heightIn: [6, 120],
  depthIn: [0.5, 12],
};

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" })); // photos travel as base64 in the JSON body

async function readJson(file) {
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}
async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

app.get("/api/mock-jobs", async (_req, res) => {
  const jobs = await readJson(MOCK_JOBS_FILE);
  res.json(jobs);
});

app.get("/api/window-options", (_req, res) => {
  res.json({ windowTypes: WINDOW_TYPES, facingDirections: FACING_DIRECTIONS });
});

function validateWindow(w, index) {
  const errors = [];
  // Photos are encouraged but not required: forcing an upload mid-visit can be
  // more friction than it's worth, so the client nudges instead of blocking.
  const required = ["location", "widthIn", "heightIn", "depthIn", "windowType", "facingDirection"];
  for (const field of required) {
    if (w[field] === undefined || w[field] === null || w[field] === "") {
      errors.push(`Window ${index + 1}: missing ${field}`);
    }
  }
  return errors;
}

function flagAnomalies(w, index) {
  const flags = [];
  for (const [field, [min, max]] of Object.entries(RANGES)) {
    const val = Number(w[field]);
    if (!Number.isNaN(val) && (val < min || val > max)) {
      const confirmedNote = w.rangeConfirmed ? " (technician confirmed this is correct)" : "";
      flags.push(`Window ${index + 1}: ${field}=${val}" is outside the plausible range (${min}-${max}")${confirmedNote}`);
    }
  }
  if (w.uncertain) {
    const note = w.uncertainNote ? ` — "${w.uncertainNote}"` : "";
    flags.push(`Window ${index + 1}: technician flagged this measurement as unsure${note}`);
  }
  return flags;
}

app.post("/api/submissions", async (req, res) => {
  const { jobId, customerName, siteAddress, techName, windows } = req.body;

  if (!jobId || !techName || !Array.isArray(windows) || windows.length === 0) {
    return res.status(400).json({ error: "jobId, techName, and at least one window are required" });
  }

  const errors = windows.flatMap(validateWindow);
  if (errors.length > 0) {
    // Server re-validates because the client is never trusted as the source of truth.
    return res.status(400).json({ error: "Incomplete submission", details: errors });
  }

  const flags = windows.flatMap(flagAnomalies);

  const submissions = await readJson(SUBMISSIONS_FILE);
  const submission = {
    id: randomUUID(),
    jobId,
    customerName,
    siteAddress,
    techName,
    submittedAt: new Date().toISOString(),
    windows,
    flags,
    status: "pending_review",
    clarificationHistory: [],
  };
  submissions.unshift(submission);
  await writeJson(SUBMISSIONS_FILE, submissions);

  res.status(201).json(submission);
});

app.get("/api/submissions", async (req, res) => {
  const submissions = await readJson(SUBMISSIONS_FILE);
  const { status } = req.query;
  res.json(status ? submissions.filter((s) => s.status === status) : submissions);
});

app.post("/api/submissions/:id/approve", async (req, res) => {
  const submissions = await readJson(SUBMISSIONS_FILE);
  const submission = submissions.find((s) => s.id === req.params.id);
  if (!submission) return res.status(404).json({ error: "Not found" });

  submission.status = "sent_to_billing";
  submission.approvedAt = new Date().toISOString();
  await writeJson(SUBMISSIONS_FILE, submissions);

  // This is the mocked system boundary: in production this POSTs to the
  // customer's ERP/billing API. Here it's a structured record dropped into
  // a queue file, proving the handoff is automatic instead of re-keyed by hand.
  const billingQueue = await readJson(BILLING_FILE);
  billingQueue.push({
    submissionId: submission.id,
    jobId: submission.jobId,
    customerName: submission.customerName,
    siteAddress: submission.siteAddress,
    queuedAt: new Date().toISOString(),
    windows: submission.windows.map(({ photos, ...rest }) => rest), // billing payload doesn't need photo blobs
  });
  await writeJson(BILLING_FILE, billingQueue);

  res.json(submission);
});

app.post("/api/submissions/:id/request-clarification", async (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: "A note explaining what's needed is required" });

  const submissions = await readJson(SUBMISSIONS_FILE);
  const submission = submissions.find((s) => s.id === req.params.id);
  if (!submission) return res.status(404).json({ error: "Not found" });

  submission.status = "needs_clarification";
  submission.clarificationHistory.push({ note, requestedAt: new Date().toISOString() });
  await writeJson(SUBMISSIONS_FILE, submissions);

  res.json(submission);
});

app.post("/api/submissions/:id/resubmit", async (req, res) => {
  const { windows } = req.body;
  if (!Array.isArray(windows) || windows.length === 0) {
    return res.status(400).json({ error: "At least one window is required" });
  }

  const errors = windows.flatMap(validateWindow);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Incomplete submission", details: errors });
  }

  const submissions = await readJson(SUBMISSIONS_FILE);
  const submission = submissions.find((s) => s.id === req.params.id);
  if (!submission) return res.status(404).json({ error: "Not found" });

  submission.windows = windows;
  submission.flags = windows.flatMap(flagAnomalies);
  submission.status = "pending_review";
  submission.resubmittedAt = new Date().toISOString();
  await writeJson(SUBMISSIONS_FILE, submissions);

  res.json(submission);
});

app.get("/api/billing-queue", async (_req, res) => {
  const billingQueue = await readJson(BILLING_FILE);
  res.json(billingQueue);
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
