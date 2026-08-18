import { useEffect, useState } from "react";
import { getSubmissions, approveSubmission, getBillingQueue, requestClarification } from "./api";

function SubmissionHistory({ s }) {
  const events = [{ label: "Submitted by technician", at: s.submittedAt }];
  (s.clarificationHistory || []).forEach((h) => {
    events.push({ label: `Manager requested clarification: "${h.note}"`, at: h.requestedAt });
  });
  if (s.resubmittedAt) events.push({ label: "Resubmitted by technician", at: s.resubmittedAt });
  if (s.approvedAt) events.push({ label: "Approved & sent to billing", at: s.approvedAt });
  events.sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <details className="audit-trail">
      <summary>History ({events.length})</summary>
      <ul>
        {events.map((e, i) => (
          <li key={i}>
            {new Date(e.at).toLocaleString()} — {e.label}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SubmissionCard({ s, busyId, onApprove, onRequestClarification }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  function send() {
    if (!note.trim()) return;
    onRequestClarification(s.id, note.trim());
    setNoteOpen(false);
    setNote("");
  }

  return (
    <div className={`card submission ${s.flags.length > 0 ? "flagged" : ""}`}>
      <div className="submission-header">
        <div>
          <strong>{s.jobId}</strong> — {s.customerName}
          <div className="muted">{s.siteAddress}</div>
          <div className="muted">
            Tech: {s.techName} · Submitted {new Date(s.submittedAt).toLocaleString()}
          </div>
        </div>
        <span className={`badge ${s.status}`}>{s.status.replaceAll("_", " ")}</span>
      </div>

      {s.flags.length > 0 && (
        <div className="flags">
          <strong>Flagged for review:</strong>
          <ul>
            {s.flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <SubmissionHistory s={s} />

      <div className="window-summaries">
        {s.windows.map((w, i) => (
          <div className="window-summary" key={i}>
            <div>
              <strong>{w.location}</strong> — {w.windowType}, facing {w.facingDirection}
              {w.uncertain && <span className="badge uncertain">tech unsure</span>}
            </div>
            <div className="muted">
              {w.widthIn}" × {w.heightIn}" × {w.depthIn}" deep · qty {w.quantity}
            </div>
            {w.notes && <div className="muted">Note: {w.notes}</div>}
            {w.uncertainNote && <div className="muted">Tech flagged: {w.uncertainNote}</div>}
            <div className="photo-strip">
              {w.photos.map((src, idx) => (
                <img className="thumb" key={idx} src={src} alt="window" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {s.status === "pending_review" && (
        <div className="card-actions">
          <button className="primary" disabled={busyId === s.id} onClick={() => onApprove(s.id)}>
            {busyId === s.id ? "Sending…" : "Approve & Send to Billing"}
          </button>
          {!noteOpen && (
            <button type="button" className="secondary" onClick={() => setNoteOpen(true)}>
              Request Clarification
            </button>
          )}
        </div>
      )}

      {noteOpen && (
        <div className="clarification-form">
          <textarea
            placeholder="What does the tech need to fix or clarify?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="card-actions">
            <button type="button" onClick={() => setNoteOpen(false)}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={send} disabled={!note.trim()}>
              Send to technician
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const [submissions, setSubmissions] = useState([]);
  const [billingQueue, setBillingQueue] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const [subs, billing] = await Promise.all([getSubmissions(), getBillingQueue()]);
    setSubmissions(subs);
    setBillingQueue(billing);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleApprove(id) {
    setBusyId(id);
    await approveSubmission(id);
    await refresh();
    setBusyId(null);
  }

  async function handleRequestClarification(id, note) {
    setBusyId(id);
    await requestClarification(id, note);
    await refresh();
    setBusyId(null);
  }

  const needsReview = submissions.filter((s) => s.status === "pending_review" && s.flags.length > 0);
  const readyToApprove = submissions.filter((s) => s.status === "pending_review" && s.flags.length === 0);
  const awaitingTech = submissions.filter((s) => s.status === "needs_clarification");
  const sent = submissions.filter((s) => s.status === "sent_to_billing");

  const cardProps = { busyId, onApprove: handleApprove, onRequestClarification: handleRequestClarification };

  return (
    <div>
      <h2>Manager Dashboard</h2>

      <section>
        <h3>Needs review ({needsReview.length})</h3>
        {needsReview.length === 0 && <p className="muted">Nothing flagged.</p>}
        {needsReview.map((s) => (
          <SubmissionCard s={s} key={s.id} {...cardProps} />
        ))}
      </section>

      <section>
        <h3>Ready to approve ({readyToApprove.length})</h3>
        {readyToApprove.length === 0 && <p className="muted">Nothing pending.</p>}
        {readyToApprove.map((s) => (
          <SubmissionCard s={s} key={s.id} {...cardProps} />
        ))}
      </section>

      <section>
        <h3>Waiting on technician ({awaitingTech.length})</h3>
        {awaitingTech.length === 0 && <p className="muted">Nothing sent back.</p>}
        {awaitingTech.map((s) => (
          <SubmissionCard s={s} key={s.id} {...cardProps} />
        ))}
      </section>

      <section>
        <h3>Sent to billing ({sent.length})</h3>
        {sent.map((s) => (
          <SubmissionCard s={s} key={s.id} {...cardProps} />
        ))}
      </section>

      <section>
        <h3>Downstream systems ({billingQueue.length})</h3>
        <p className="muted">
          Mock queue standing in for ABC's production, inventory, and billing systems — this is
          the structured payload each of those would receive automatically, instead of a
          re-typed order.
        </p>
        {billingQueue.length === 0 && <p className="muted">Nothing queued yet.</p>}
        {billingQueue.length > 0 && (
          <table className="downstream-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Windows</th>
                <th>Queued</th>
              </tr>
            </thead>
            <tbody>
              {billingQueue.map((b) => (
                <tr key={b.submissionId}>
                  <td>{b.jobId}</td>
                  <td>{b.customerName}</td>
                  <td>{b.windows.length}</td>
                  <td>{new Date(b.queuedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
