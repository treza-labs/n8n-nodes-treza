# Changelog

## 0.1.1 (2026-11-05)

Changes to meet n8n's guidelines for verified community nodes.

- **Simplify**, on by default, for renders (Video Generate and Assemble, Image Generate, Media Edit, Pipeline Run, Run Wait for Completion) and Run → Get. The item then carries at most 10 fields: `url`, `status`, `estimatedChargeUsd`, `model`, `durationMs`, `outputs`, `runId` and `pipelineId`, plus `timedOut`, `progress` or `statusNote` when set. Turn it off for the whole run.
- Items no longer carry text Treza writes for assistants in a chat (`note`, `goAheadNote`, `canvasDefaults`).
- When a render stops before it finishes, the message gives Treza's reason, and the description links to the pipeline to see which step stopped.

## 0.1.0 (2026-11-04)

First version, published to npm as `@treza/n8n-nodes-treza`.

- **Treza** node: Video (Generate, Assemble), Image (Generate), Media (Edit, Import From URL, Upload), Pipeline (Run, Estimate Cost, Get Many), Run (Get, Get Many, Cancel, Wait for Completion), Account (Get Balance).
- **Treza Trigger**: polls a pipeline and fires when a run finishes, filtered by status.
- **Treza API** credential, tested against the credit balance.
- Max Cost on every quoted render. Quotes are retried when another render takes the scratch pipeline first, waits time out without failing, and executions that are stopped cancel the render.
