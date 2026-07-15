// Sardine (mock) — hackathon spike. Plays the external KYC party for the ROLLER
// workflow engine's action.kyc.verify node. Everything is in-memory.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // callback target is roller.local (self-signed cert)

import express from 'express';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Extra headers for the callback POST, for when the ROLLER API sits behind an auth wall
// (Cloudflare Access service token, basic-auth tunnel, gateway key). JSON object, e.g.
// CALLBACK_HEADERS='{"CF-Access-Client-Id":"...","CF-Access-Client-Secret":"..."}'
const callbackHeaders = JSON.parse(process.env.CALLBACK_HEADERS ?? '{}');

/** @type {Map<number, {runId: number, resumeToken: string, callbackUrl: string, customer: object, receivedAt: string}>} */
const pending = new Map();

// The workflow engine's KycVerifyNodeExecutor POSTs here when a run hits the KYC node.
app.post('/webhook', (req, res) => {
  const { runId, resumeToken, callbackUrl, customer } = req.body ?? {};
  if (runId == null || !resumeToken || !callbackUrl) {
    return res.status(400).json({ error: 'runId, resumeToken and callbackUrl are required' });
  }
  pending.set(runId, { runId, resumeToken, callbackUrl, customer, receivedAt: new Date().toISOString() });
  console.log(`[webhook] run ${runId} pending verification (${pending.size} in queue)`);
  res.sendStatus(204);
});

app.get('/api/pending', (_req, res) => {
  res.json([...pending.values()].map(({ resumeToken, callbackUrl, ...item }) => item));
});

// The human rated the guest's risk — resume the parked workflow run through that port.
app.post('/api/decide', async (req, res) => {
  const { runId, outcome, reason } = req.body ?? {};
  const item = pending.get(runId);
  if (!item) {
    return res.status(404).json({ error: `no pending verification for run ${runId}` });
  }
  if (!['low', 'medium', 'high'].includes(outcome)) {
    return res.status(400).json({ error: "outcome must be 'low', 'medium' or 'high'" });
  }
  try {
    const response = await fetch(item.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...callbackHeaders },
      body: JSON.stringify({
        resumeToken: item.resumeToken,
        outputPort: outcome,
        output: { riskLevel: outcome, reason: reason ?? null },
      }),
    });
    if (!response.ok) {
      console.error(`[decide] callback for run ${runId} failed: HTTP ${response.status}`);
      return res.status(502).json({ error: `callback returned HTTP ${response.status}` });
    }
    pending.delete(runId);
    console.log(`[decide] run ${runId} rated ${outcome} risk`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[decide] callback for run ${runId} failed: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

const port = process.env.PORT ?? 4600;
app.listen(port, () => console.log(`Sardine mock verifier listening on http://localhost:${port}`));
