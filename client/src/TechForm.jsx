import { useEffect, useState } from "react";
import {
  getMockJobs,
  getWindowOptions,
  createSubmission,
  getSubmissions,
  resubmitSubmission,
} from "./api";

const RANGES = {
  widthIn: { min: 6, max: 120, label: "Width" },
  heightIn: { min: 6, max: 120, label: "Height" },
  depthIn: { min: 0.5, max: 12, label: "Depth" },
};

function blankWindow() {
  return {
    id: crypto.randomUUID(),
    location: "",
    widthIn: "",
    heightIn: "",
    depthIn: "",
    windowType: "",
    facingDirection: "",
    quantity: 1,
    notes: "",
    photos: [], // array of { name, dataUrl }
    uncertain: false,
    uncertainNote: "",
    rangeConfirmed: false,
  };
}

function filesToDataUrls(fileList) {
  const files = Array.from(fileList);
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
}

const REQUIRED_FIELDS = ["location", "widthIn", "heightIn", "depthIn", "windowType", "facingDirection"];

function windowRangeIssues(w) {
  return Object.entries(RANGES)
    .map(([field, { min, max, label }]) => {
      const val = Number(w[field]);
      if (w[field] !== "" && !Number.isNaN(val) && (val < min || val > max)) {
        return { field, label, min, max, val };
      }
      return null;
    })
    .filter(Boolean);
}

function hardErrorsFor(windows) {
  const errors = [];
  windows.forEach((w, i) => {
    REQUIRED_FIELDS.forEach((field) => {
      if (w[field] === "" || w[field] === null || w[field] === undefined) {
        errors.push(`Window ${i + 1}: ${field} is required`);
      }
    });
    if (windowRangeIssues(w).length > 0 && !w.rangeConfirmed) {
      errors.push(`Window ${i + 1}: confirm or correct the unusual measurement before submitting`);
    }
  });
  return errors;
}

function gapsIn(windows) {
  return windows
    .map((w, i) => (w.photos.length === 0 && w.notes.trim() === "" ? i + 1 : null))
    .filter(Boolean);
}

export default function TechForm() {
  const [mockJobs, setMockJobs] = useState([]);
  const [windowOptions, setWindowOptions] = useState({ windowTypes: [], facingDirections: [] });
  const [jobId, setJobId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [techName, setTechName] = useState("");
  const [windows, setWindows] = useState([blankWindow()]);
  const [errors, setErrors] = useState([]);
  const [gapWarning, setGapWarning] = useState(null); // array of window numbers, or null
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [clarificationQueue, setClarificationQueue] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingNote, setEditingNote] = useState("");

  useEffect(() => {
    getMockJobs().then(setMockJobs);
    getWindowOptions().then(setWindowOptions);
    refreshClarificationQueue();
  }, []);

  function refreshClarificationQueue() {
    getSubmissions("needs_clarification").then(setClarificationQueue);
  }

  function selectJob(id) {
    setJobId(id);
    const job = mockJobs.find((j) => j.jobId === id);
    if (job) {
      setCustomerName(job.customerName);
      setSiteAddress(job.siteAddress);
      setTechName(job.techName);
    }
  }

  function startResubmission(submission) {
    setEditingId(submission.id);
    setEditingNote(submission.clarificationHistory.at(-1)?.note || "");
    setJobId(submission.jobId);
    setCustomerName(submission.customerName);
    setSiteAddress(submission.siteAddress);
    setTechName(submission.techName);
    setWindows(
      submission.windows.map((w) => ({
        ...w,
        photos: (w.photos || []).map((dataUrl, i) => ({ name: `existing-${i}`, dataUrl })),
        uncertain: w.uncertain || false,
        uncertainNote: w.uncertainNote || "",
        rangeConfirmed: w.rangeConfirmed || false,
      }))
    );
    setErrors([]);
    setGapWarning(null);
    setConfirmation(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingNote("");
    setJobId("");
    setCustomerName("");
    setSiteAddress("");
    setTechName("");
    setWindows([blankWindow()]);
    setErrors([]);
    setGapWarning(null);
  }

  function updateWindow(id, field, value) {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const next = { ...w, [field]: value };
        // any edit to a dimension re-opens the confirmation for that window
        if (["widthIn", "heightIn", "depthIn"].includes(field)) next.rangeConfirmed = false;
        return next;
      })
    );
  }

  async function handlePhotoChange(id, fileList) {
    const newPhotos = await filesToDataUrls(fileList);
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, photos: [...w.photos, ...newPhotos] } : w))
    );
  }

  function removePhoto(windowId, index) {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId ? { ...w, photos: w.photos.filter((_, i) => i !== index) } : w
      )
    );
  }

  function addWindow() {
    setWindows((prev) => [...prev, blankWindow()]);
  }

  function removeWindow(id) {
    setWindows((prev) => (prev.length > 1 ? prev.filter((w) => w.id !== id) : prev));
  }

  function buildPayloadWindows() {
    return windows.map((w) => ({
      ...w,
      widthIn: Number(w.widthIn),
      heightIn: Number(w.heightIn),
      depthIn: Number(w.depthIn),
      quantity: Number(w.quantity) || 1,
      photos: w.photos.map((p) => p.dataUrl),
    }));
  }

  async function doActualSubmit() {
    setSubmitting(true);
    try {
      let result;
      if (editingId) {
        result = await resubmitSubmission(editingId, buildPayloadWindows());
        result = { ...result, resubmitted: true };
      } else {
        result = await createSubmission({
          jobId,
          customerName,
          siteAddress,
          techName,
          windows: buildPayloadWindows(),
        });
      }
      setConfirmation(result);
      setWindows([blankWindow()]);
      setEditingId(null);
      setGapWarning(null);
      refreshClarificationQueue();
    } catch (err) {
      setErrors(err.details || [err.message]);
      setGapWarning(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = hardErrorsFor(windows);
    if (!editingId && !jobId) errs.unshift("Select a job before submitting");
    if (errs.length > 0) {
      setErrors(errs);
      setGapWarning(null);
      return;
    }
    setErrors([]);

    const gaps = gapsIn(windows);
    if (gaps.length > 0 && !gapWarning) {
      setGapWarning(gaps);
      return;
    }

    await doActualSubmit();
  }

  if (confirmation) {
    return (
      <div className="card confirmation">
        <h2>{confirmation.resubmitted ? "Resubmitted" : "Submitted"}</h2>
        <p>
          Job {confirmation.jobId} {confirmation.resubmitted ? "sent back for manager review" : "sent for review"} —{" "}
          {confirmation.windows.length} window(s) recorded.
        </p>
        {confirmation.flags.length > 0 && (
          <div className="flags">
            <strong>Flagged for manager attention:</strong>
            <ul>
              {confirmation.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        <button onClick={() => setConfirmation(null)}>Start another job</button>
      </div>
    );
  }

  return (
    <>
      {clarificationQueue.length > 0 && !editingId && (
        <div className="card clarification-queue">
          <h3>Needs your attention ({clarificationQueue.length})</h3>
          {clarificationQueue.map((s) => (
            <div className="clarification-item" key={s.id}>
              <div>
                <strong>{s.jobId}</strong> — {s.customerName}
              </div>
              <div className="muted">Manager: "{s.clarificationHistory.at(-1)?.note}"</div>
              <button type="button" onClick={() => startResubmission(s)}>
                Fix &amp; Resubmit
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <h2>{editingId ? "Resubmit Measurements" : "Field Measurement Capture"}</h2>

        {editingId ? (
          <div className="job-meta">
            <div>
              Resubmitting for <strong>{jobId}</strong> — {customerName}
            </div>
            <div className="muted">Manager asked: "{editingNote}"</div>
            <button type="button" className="link-button" onClick={cancelEdit}>
              Cancel and start a new job instead
            </button>
          </div>
        ) : (
          <>
            <label>
              Job
              <select value={jobId} onChange={(e) => selectJob(e.target.value)}>
                <option value="">Select a job…</option>
                {mockJobs.map((j) => (
                  <option key={j.jobId} value={j.jobId}>
                    {j.jobId} — {j.customerName}
                  </option>
                ))}
              </select>
            </label>

            {jobId && (
              <div className="job-meta">
                <div>{customerName}</div>
                <div>{siteAddress}</div>
                <div>Tech: {techName}</div>
              </div>
            )}
          </>
        )}

        {errors.length > 0 && (
          <div className="errors">
            <ul>
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {windows.map((w, i) => {
          const rangeIssues = windowRangeIssues(w);
          return (
            <fieldset className="window-block" key={w.id}>
              <legend>Window {i + 1}</legend>

              <label>
                Location / Room
                <input
                  type="text"
                  placeholder="e.g. Living Room - North Wall"
                  value={w.location}
                  onChange={(e) => updateWindow(w.id, "location", e.target.value)}
                />
              </label>

              <div className="dims">
                <label>
                  Width (in)
                  <input
                    type="number"
                    min="0"
                    step="0.125"
                    value={w.widthIn}
                    onChange={(e) => updateWindow(w.id, "widthIn", e.target.value)}
                  />
                </label>
                <label>
                  Height (in)
                  <input
                    type="number"
                    min="0"
                    step="0.125"
                    value={w.heightIn}
                    onChange={(e) => updateWindow(w.id, "heightIn", e.target.value)}
                  />
                </label>
                <label>
                  Depth (in)
                  <input
                    type="number"
                    min="0"
                    step="0.125"
                    value={w.depthIn}
                    onChange={(e) => updateWindow(w.id, "depthIn", e.target.value)}
                  />
                </label>
              </div>

              {rangeIssues.length > 0 && (
                <div className="range-warning">
                  {rangeIssues.map((issue) => (
                    <div key={issue.field}>
                      {issue.label} of {issue.val}" is unusual for a window (expected {issue.min}"–
                      {issue.max}"). Double-check the number.
                    </div>
                  ))}
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={w.rangeConfirmed}
                      onChange={(e) => updateWindow(w.id, "rangeConfirmed", e.target.checked)}
                    />
                    I've double-checked — this measurement is correct
                  </label>
                </div>
              )}

              <div className="dims">
                <label>
                  Window Type
                  <select
                    value={w.windowType}
                    onChange={(e) => updateWindow(w.id, "windowType", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {windowOptions.windowTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Facing Direction
                  <select
                    value={w.facingDirection}
                    onChange={(e) => updateWindow(w.id, "facingDirection", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {windowOptions.facingDirections.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    value={w.quantity}
                    onChange={(e) => updateWindow(w.id, "quantity", e.target.value)}
                  />
                </label>
              </div>

              <label>
                Notes
                <textarea
                  value={w.notes}
                  onChange={(e) => updateWindow(w.id, "notes", e.target.value)}
                />
              </label>

              <label>
                Photos (optional)
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) => handlePhotoChange(w.id, e.target.files)}
                />
              </label>
              {w.photos.length > 0 && (
                <div className="photo-strip">
                  {w.photos.map((p, idx) => (
                    <div className="photo-thumb" key={idx}>
                      <img src={p.dataUrl} alt={p.name} />
                      <button type="button" onClick={() => removePhoto(w.id, idx)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label className="checkbox-label uncertain-toggle">
                <input
                  type="checkbox"
                  checked={w.uncertain}
                  onChange={(e) => updateWindow(w.id, "uncertain", e.target.checked)}
                />
                I'm not confident in this measurement — flag for review
              </label>
              {w.uncertain && (
                <input
                  type="text"
                  placeholder="What's uncertain? (optional)"
                  value={w.uncertainNote}
                  onChange={(e) => updateWindow(w.id, "uncertainNote", e.target.value)}
                />
              )}

              {windows.length > 1 && (
                <button type="button" className="remove-window" onClick={() => removeWindow(w.id)}>
                  Remove window
                </button>
              )}
            </fieldset>
          );
        })}

        <button type="button" onClick={addWindow}>
          + Add another window
        </button>

        {gapWarning && (
          <p className="submit-nudge">
            No photo or notes for window(s) {gapWarning.join(", ")} — anything else to add? Tap Submit
            again to send as-is.
          </p>
        )}

        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Submitting…" : editingId ? "Resubmit measurements" : "Submit measurements"}
        </button>
      </form>
    </>
  );
}
