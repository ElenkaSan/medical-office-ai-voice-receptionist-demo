# Architecture

This document is the source of truth for the portfolio architecture diagram.

## Mermaid

```mermaid
flowchart TB
  Caller[Caller]
  Tel[Telephony Provider Adapter]
  Media[Realtime Media Layer<br/>LiveKit-style SIP / rooms]
  VSM[Voice Session Manager]
  Bridge[Audio Bridge]
  AI[AI Realtime Provider Adapter]
  Intent[Intent Router]
  Xfer[Transfer Orchestrator]
  Workflow[Post-Call Workflow]
  Staff[Office Staff / Queues]
  Auto[External Automation<br/>e.g. n8n-style webhooks]

  Caller --> Tel --> Media --> VSM
  VSM <--> Bridge
  Bridge <--> AI
  VSM --> Intent
  Intent -->|administrative| Workflow
  Intent -->|clinical / staff request| Xfer
  Xfer --> Tel
  Xfer --> Staff
  Xfer --> Workflow
  Workflow --> Auto
```

## Exporting / refreshing `architecture.png`

A committed diagram is available at `docs/architecture.png`.

To regenerate it:

1. Open [mermaid.live](https://mermaid.live)
2. Paste the Mermaid block above
3. Export as PNG
4. Save as `docs/architecture.png`

No heavy diagram tooling is required to run this repository.
