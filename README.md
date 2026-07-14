# KYC Verifier (hackathon spike)

Plays the "external verification party" for the ROLLER workflow engine's `action.kyc.verify` node.

```
npm install
npm start        # http://localhost:4600, override with PORT
```

Flow:
1. The workflow engine POSTs `{ runId, resumeToken, callbackUrl, customer }` to `POST /webhook` when a run reaches a KYC Verify node.
2. Open `http://localhost:4600` — pending verifications appear as cards (3s poll).
3. Approve/Decline POSTs `{ resumeToken, outputPort: "approved"|"declined", output: { approved, reason } }` back to the engine's `callbackUrl`, which resumes the parked workflow run.

Everything is in-memory; restart to clear. TLS verification is disabled in-process because the callback target (`roller.local`) uses a self-signed cert.
