# Changelog

## 0.1.4 (2026-11-18)

- **Max Cost (USD)** is optional, with no default. Leave it at 0 and the item runs at the price Treza quotes, as long as your balance covers it. Set it and the node still stops, with nothing charged, when the price is higher. The old $2 default on Video → Generate stopped clips people meant to make: 8 seconds of Seedance 2.5 costs $2.63.
- Treza nodes already in your workflows are unchanged. They are version 1 of the node and keep the Max Cost they have, including the old default. Add the node again to get one without a cap.

## 0.1.3 (2026-11-09)

Changes asked for in n8n's review for verified community nodes.

- **Image → Generate**: Aspect Ratio moved into Additional Fields.
- **Media → Import From URL** and **Upload**: Name moved into Additional Fields.
- The node panel finds Treza by "Treza", "Treza pipeline", "pipeline run" and "render finished", no longer by generic words such as "video" or "image".

Workflows saved with 0.1.2 or earlier lose a set Aspect Ratio or Name on these operations: set it again under Additional Fields.

## 0.1.2 (2026-11-05)

- **Pipeline → Run** asks Treza for the price of this run with its inputs (a longer source video costs more), checks it against Max Cost and runs at that quoted price. Before, the quote was for the pipeline as saved; when the inputs made the run cost more, it ran without a quote. Every pipeline run now has a quote.
- If the price moves between the quote and the run (the pipeline was edited), the node asks for a new quote and checks it against Max Cost again.
- **Pipeline → Estimate Cost** takes the same Inputs as Run and prices with them.

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
