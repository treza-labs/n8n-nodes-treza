# @treza/n8n-nodes-treza

An [n8n](https://n8n.io/) community node for [Treza](https://www.trezalabs.com). With it a workflow can generate videos and images, edit footage, assemble finished cuts, and run your Treza pipelines.

Treza connects the best AI video and image models (Veo, Seedance, Kling, Gemini, FLUX and more) with voiceover, captions, editing and publishing. This node lets any n8n workflow use them, for example:

- a new row in a sheet becomes a vertical video,
- a podcast episode becomes captioned clips,
- a new Shopify product gets ad variations.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Spending and safety](#spending-and-safety) · [Examples](#example-workflows) · [Compatibility](#compatibility)

## Installation

In n8n, go to **Settings → Community Nodes → Install** and enter `@treza/n8n-nodes-treza`. For other setups, see n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

1. Sign in to Treza and open **[API keys](https://www.trezalabs.com/platform/api-keys)**.
2. Create a key with the `pipelines:read`, `pipelines:write` and `pipelines:run` permissions.
3. In n8n, create a **Treza API** credential and paste the key (`treza_live_...`). The credential test checks the key against your credit balance.

Renders are paid from your Treza credit balance. Add credits in Treza before your first render.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| **Video** | Generate | Generate a clip from a prompt. You choose the shape, length and model, and can start from or end on a picture, or continue a clip. |
| | Assemble | Join clips or images into one video, with a music bed (from your library or composed from a description), narration, captions, transitions and Ken Burns moves on stills. |
| **Image** | Generate | Generate a picture from a prompt, or restyle up to 4 reference pictures. |
| **Media** | Edit | Run edits over a video, image or audio file, in order: captions, upscale, background removal, trim, overlay, lipsync and more. |
| | Import From URL | Add a file at a public link to your Treza library. |
| | Upload | Upload a binary file from the workflow to your Treza library. |
| **Pipeline** | Run | Run one of your pipelines with new inputs (text, a file URL or JSON per input step). |
| | Estimate Cost | Price one run of a pipeline with the inputs you give it, and check that your balance covers it. |
| | Get Many | List your pipelines. |
| **Run** | Get / Get Many / Cancel / Wait for Completion | Check on renders, stop one, or wait for one started earlier. |
| **Account** | Get Balance | Your credit balance and the link to top it up. |

**Treza Trigger** starts a workflow when a run of a pipeline finishes. You choose which endings count: succeeded, failed, partly finished or cancelled. Treza runs started anywhere fire it, whether from the canvas, a schedule, the API or another workflow.

Render operations wait for the render to finish by default. They output its `url`, its `outputs`, and the `runId` and `pipelineId`. **Simplify** (on by default) keeps the item to those and the price, model and duration; turn it off for everything Treza reports about the run. Turn on **Download Output** to get the file as binary data for the next node, for example to upload it to YouTube or Drive. Turn off **Wait for Completion** to output the run ID straight away, then pick the render up later with **Run → Wait for Completion**.

The node can also be used as a tool by n8n's AI Agent.

## Spending and safety

No one approves a price inside an automation, so the node enforces a limit itself:

- **Max Cost (USD)** is required on Video → Generate, Image → Generate and Pipeline → Run. The node gets Treza's quote first. If the price is over your limit, or your balance doesn't cover it, the item stops and **nothing is charged**. The render then starts at the quoted price, once.
- **Retries don't double-charge.**
  - A wait that runs past its timeout does not fail the item. The item comes out with `timedOut: true` and the render carries on, so n8n's *Retry On Fail* never starts a second paid render.
  - Assemble and Edit send an ID for each item of each execution, so a retry returns the render already started.
- **Stopping the execution while it waits** cancels the render on Treza too.
- **Media → Edit has no price cap yet**, because Treza doesn't quote edits in advance. Video → Assemble is free once your account has bought credits.

## Example workflows

The [`examples/`](examples) folder has workflows to import into n8n (**Workflows → Import from File**):

- [`sheet-row-to-vertical-video.json`](examples/sheet-row-to-vertical-video.json): each new Google Sheets row becomes a 9:16 clip, and the clip's link is written back to the row.
- [`clips-to-music-video.json`](examples/clips-to-music-video.json): generate three shots from one idea, then assemble them with a composed music bed, captions and transitions.
- [`run-finished-to-slack.json`](examples/run-finished-to-slack.json): post every finished pipeline run to Slack with a link to the video.

## Compatibility

Built and tested with n8n 2.x using `@n8n/node-cli`. Nodes use n8n's `n8nNodesApiVersion` 1.

## Development

```bash
npm install
npm run dev     # n8n at http://localhost:5678 with this node loaded, rebuilt on save
npm run lint    # n8n's community node rules, strict mode (n8n Cloud eligible)
npm run build
npm test        # every operation against a mock Treza API: price caps, quotes, retries, waits, uploads
```

Releases go out with `npm run release`. It tags a version, and the `publish.yml` workflow publishes the package to npm with a provenance statement, which n8n requires for verified community nodes.

## Resources

- [Treza](https://www.trezalabs.com) · [Treza REST API](https://www.trezalabs.com/api/v1/tools) · [OpenAPI document](https://www.trezalabs.com/api/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE.md)
