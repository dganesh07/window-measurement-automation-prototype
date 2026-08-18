const BASE = "http://localhost:4000/api";

export async function getMockJobs() {
  const res = await fetch(`${BASE}/mock-jobs`);
  return res.json();
}

export async function getWindowOptions() {
  const res = await fetch(`${BASE}/window-options`);
  return res.json();
}

export async function getSubmissions(status) {
  const res = await fetch(status ? `${BASE}/submissions?status=${status}` : `${BASE}/submissions`);
  return res.json();
}

export async function createSubmission(payload) {
  const res = await fetch(`${BASE}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "Submission failed"), { details: data.details });
  return data;
}

export async function approveSubmission(id) {
  const res = await fetch(`${BASE}/submissions/${id}/approve`, { method: "POST" });
  return res.json();
}

export async function getBillingQueue() {
  const res = await fetch(`${BASE}/billing-queue`);
  return res.json();
}

export async function requestClarification(id, note) {
  const res = await fetch(`${BASE}/submissions/${id}/request-clarification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  return res.json();
}

export async function resubmitSubmission(id, windows) {
  const res = await fetch(`${BASE}/submissions/${id}/resubmit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windows }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "Resubmit failed"), { details: data.details });
  return data;
}
