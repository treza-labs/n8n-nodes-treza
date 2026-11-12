#!/usr/bin/env python3
"""
Builds the n8n template-library workflows in examples/templates/.

Each one follows n8n's template guidelines: one yellow overview note at the
top left (How it works, Setup, Customization, Requirements), a short white
note per section, descriptive node names, the values people change in one
Settings node, and no credentials, IDs or pinned data.

Run: python3 examples/build-templates.py
"""
import json
import pathlib
import uuid

OUT = pathlib.Path(__file__).parent / "templates"
NS = uuid.UUID("6f1c2f8e-1d3a-4c55-9a51-0b7d6b3c2a10")

TREZA = "@treza/n8n-nodes-treza.treza"
TREZA_TOOL = "@treza/n8n-nodes-treza.trezaTool"
TREZA_TRIGGER = "@treza/n8n-nodes-treza.trezaTrigger"

REQUIREMENTS = (
    "### Requirements\n"
    "- The verified community node **Treza** (`@treza/n8n-nodes-treza`, tested with 0.1.3 on n8n 2.46.6). "
    "On n8n Cloud, search for Treza in the nodes panel. Self-hosted: Settings > Community Nodes. "
    "Guide: https://www.trezalabs.com/integrations/n8n\n"
    "- A Treza API key from https://www.trezalabs.com/platform/api-keys with the pipelines:read, pipelines:write "
    "and pipelines:run permissions, saved as a **Treza API** credential."
)


def rl(value="", mode="list"):
    return {"__rl": True, "mode": mode, "value": value}


class Flow:
    def __init__(self, slug, name):
        self.slug, self.name = slug, name
        self.nodes, self.links = [], []

    def add(self, name, type_, version, pos, params, **extra):
        node = {
            "id": str(uuid.uuid5(NS, f"{self.slug}/{name}")),
            "name": name,
            "type": type_,
            "typeVersion": version,
            "position": list(pos),
            "parameters": params,
        }
        node.update(extra)
        self.nodes.append(node)
        return name

    def note(self, name, pos, w, h, content, color=None):
        params = {"width": w, "height": h, "content": content}
        if color is not None:
            params["color"] = color
        return self.add(name, "n8n-nodes-base.stickyNote", 1, pos, params)

    def section(self, name, pos, w, h, content):
        # White section note: a ## heading and under 50 words.
        words = len(content.split())
        assert content.startswith("## ") and words < 50, (self.slug, name, words)
        return self.note(name, pos, w, h, content, color=7)

    def overview(self, content, h=620):
        words = len(content.replace("#", "").split())
        assert 100 <= words <= 300, (self.slug, words)
        return self.note("Overview", (-560, -300), 460, h, content)

    def link(self, a, b, kind="main"):
        self.links.append((a, b, kind))

    def json(self):
        connections = {}
        for a, b, kind in self.links:
            outs = connections.setdefault(a, {}).setdefault(kind, [[]])
            outs[0].append({"node": b, "type": kind, "index": 0})
        return {
            "name": self.name,
            "nodes": self.nodes,
            "connections": connections,
            "settings": {"executionOrder": "v1"},
            "pinData": {},
            "meta": {"templateCredsSetupCompleted": False},
        }

    def write(self):
        OUT.mkdir(exist_ok=True)
        path = OUT / f"{self.slug}.json"
        path.write_text(json.dumps(self.json(), indent=2, ensure_ascii=False) + "\n")
        return path


def settings(flow, pos, fields, keep_input=False):
    """The values people change, in one Edit Fields node."""
    assignments = [
        {
            "id": str(uuid.uuid5(NS, f"{flow.slug}/settings/{key}")),
            "name": key,
            "type": kind,
            "value": value,
        }
        for key, kind, value in fields
    ]
    params = {"assignments": {"assignments": assignments}, "options": {}}
    if keep_input:
        params["includeOtherFields"] = True
    return flow.add("Settings", "n8n-nodes-base.set", 3.4, pos, params)


S = "$('Settings').item.json"

# ---------------------------------------------------------------------------
# 1. Shot list -> generated clips -> one scored music video
# ---------------------------------------------------------------------------
f = Flow("shot-list-to-music-video", "Generate AI video shots from a shot list and cut them into a scored video with Treza")
f.overview(
    "## Turn a shot list into a finished music video\n"
    "Write a few lines describing shots. This workflow generates each shot as an AI video clip, then cuts the clips "
    "together in order with fades and an original music bed composed for the edit. The finished MP4 comes out as "
    "binary data, ready for a YouTube, Google Drive or Slack node.\n\n"
    "### How it works\n"
    "1. **Settings** holds the shot list, the shape, the clip length, the music style and the spend cap.\n"
    "2. **One item per shot** splits the list so each shot renders on its own.\n"
    "3. **Generate each shot** asks Treza for a quote, stops if it is over **Max Cost**, then renders the clip.\n"
    "4. **Collect the clips** gathers the clip links in order.\n"
    "5. **Cut and score** assembles them with transitions and composed music, and downloads the result.\n\n"
    "### Setup\n"
    "1. Add your Treza API credential to both Treza nodes.\n"
    "2. Edit the shots in **Settings**. Each line is one shot.\n"
    "3. Press **Execute workflow**. Three 4-second clips take a few minutes.\n\n"
    "### Customization\n"
    "Change the shape to 9:16 for Shorts and Reels, raise the clip length, or swap the music prompt. Replace the "
    "manual start with a Schedule or a Google Sheets trigger to make one video a day.\n\n"
    + REQUIREMENTS,
    h=760,
)
f.section("Note: shots", (-40, -140), 520, 420, "## 1. Your shots\nEdit the shot list, shape, clip length, music and spend cap in **Settings**. Each shot becomes one item.")
f.section("Note: render", (500, -140), 300, 420, "## 2. Render each shot\nTreza quotes each clip first and stops, with nothing charged, if it costs more than Max Cost.")
f.section("Note: cut", (820, -140), 520, 420, "## 3. Cut and score\nThe clips are joined in order with fades and a composed music bed. The MP4 is in the `video` binary field.")
start = f.add("Start", "n8n-nodes-base.manualTrigger", 1, (0, 100), {})
st = settings(f, (220, 100), [
    ("shots", "array", '=["Wide aerial of a misty pine forest at dawn, slow push in", "A red fox steps out of the ferns and looks toward camera", "Sunlight breaks through the canopy, dust drifting in the light beams"]'),
    ("aspectRatio", "string", "16:9"),
    ("clipSeconds", "number", 4),
    ("maxCostPerShotUsd", "number", 2),
    ("musicPrompt", "string", "calm cinematic ambient, soft piano and strings, no vocals"),
    ("title", "string", "Forest morning"),
])
split = f.add("One item per shot", "n8n-nodes-base.splitOut", 1, (420, 100), {"fieldToSplitOut": "shots", "options": {}})
gen = f.add("Generate each shot", TREZA, 1, (620, 100), {
    "resource": "video",
    "operation": "generate",
    "prompt": "={{ $json.shots }}",
    "aspectRatio": f"={{{{ {S}.aspectRatio }}}}",
    "durationSec": f"={{{{ {S}.clipSeconds }}}}",
    "maxCostUsd": f"={{{{ {S}.maxCostPerShotUsd }}}}",
    "additionalFields": {"withAudio": False},
})
agg = f.add("Collect the clips", "n8n-nodes-base.aggregate", 1, (880, 100), {"fieldsToAggregate": {"fieldToAggregate": [{"fieldToAggregate": "url"}]}, "options": {}})
cut = f.add("Cut and score", TREZA, 1, (1120, 100), {
    "resource": "video",
    "operation": "assemble",
    "clipUrls": "={{ $json.url }}",
    "additionalFields": {
        "musicPrompt": f"={{{{ {S}.musicPrompt }}}}",
        "transition": "fade",
        "fadeOutSec": 2,
        "audioFadeOutSec": 3,
        "name": f"={{{{ {S}.title }}}}",
    },
    "download": True,
    "binaryPropertyName": "video",
})
for a, b in [(start, st), (st, split), (split, gen), (gen, agg), (agg, cut)]:
    f.link(a, b)
f.write()

# ---------------------------------------------------------------------------
# 2. Google Sheets row -> vertical video -> link written back
# ---------------------------------------------------------------------------
f = Flow("sheet-rows-to-vertical-videos", "Turn new Google Sheets rows into vertical AI videos with Treza")
f.overview(
    "## A vertical video for every new row\n"
    "Plan short videos in a spreadsheet. Each new row becomes a 9:16 AI video clip, and the clip's link and status "
    "are written back to the same row, so the sheet doubles as your content calendar.\n\n"
    "### How it works\n"
    "1. **New row in sheet** checks the sheet every minute for added rows.\n"
    "2. **Settings** sets the shape, the length and the spend cap for every clip.\n"
    "3. **Generate the video** gets a quote from Treza, stops if it is over **Max Cost**, and waits for the render.\n"
    "4. **Write the link back** fills in `video_url` and `status` on the row that started it.\n\n"
    "### Setup\n"
    "1. Make a sheet with the columns `prompt`, `title`, `video_url` and `status`.\n"
    "2. Pick that sheet in both Google Sheets nodes and connect your Google account.\n"
    "3. Add your Treza API credential to **Generate the video**.\n"
    "4. Activate the workflow and add a row with a prompt.\n\n"
    "### Customization\n"
    "Change the shape to 16:9 or 1:1 in **Settings**, or the length up to the model's limit. To post the clip "
    "somewhere, add a YouTube, TikTok or Slack node after **Generate the video**.\n\n"
    + REQUIREMENTS,
    h=760,
)
f.section("Note: plan", (-40, -140), 460, 420, "## 1. Plan in a sheet\nEvery new row with a `prompt` starts one video. **Settings** holds the shape, length and spend cap.")
f.section("Note: render", (440, -140), 300, 420, "## 2. Render\nTreza quotes the clip first and stops, with nothing charged, if it costs more than Max Cost.")
f.section("Note: write back", (760, -140), 300, 420, "## 3. Write back\nThe video link and a status land on the same row.")
trig = f.add("New row in sheet", "n8n-nodes-base.googleSheetsTrigger", 1, (0, 100), {
    "pollTimes": {"item": [{"mode": "everyMinute"}]},
    "documentId": rl(),
    "sheetName": rl(),
    "event": "rowAdded",
    "options": {},
})
st = settings(f, (220, 100), [
    ("aspectRatio", "string", "9:16"),
    ("seconds", "number", 8),
    ("maxCostUsd", "number", 3),
], keep_input=True)
gen = f.add("Generate the video", TREZA, 1, (500, 100), {
    "resource": "video",
    "operation": "generate",
    "prompt": "={{ $json.prompt }}",
    "aspectRatio": "={{ $json.aspectRatio }}",
    "durationSec": "={{ $json.seconds }}",
    "maxCostUsd": "={{ $json.maxCostUsd }}",
    "additionalFields": {"name": "={{ $json.title }}"},
})
schema = [
    {"id": c, "displayName": c, "required": False, "defaultMatch": False, "display": True, "type": "string", "canBeUsedToMatch": True, **({"readOnly": True} if c == "row_number" else {})}
    for c in ("row_number", "video_url", "status")
]
back = f.add("Write the link back", "n8n-nodes-base.googleSheets", 4.7, (820, 100), {
    "operation": "update",
    "documentId": rl(),
    "sheetName": rl(),
    "columns": {
        "mappingMode": "defineBelow",
        "value": {
            "row_number": "={{ $('New row in sheet').item.json.row_number }}",
            "video_url": "={{ $json.url }}",
            "status": "={{ $json.timedOut ? 'still rendering: ' + $json.runId : 'done' }}",
        },
        "matchingColumns": ["row_number"],
        "schema": schema,
        "attemptToConvertTypes": False,
        "convertFieldsToString": False,
    },
    "options": {},
})
for a, b in [(trig, st), (st, gen), (gen, back)]:
    f.link(a, b)
f.write()

# ---------------------------------------------------------------------------
# 3. Form reply -> picture -> emailed back
# ---------------------------------------------------------------------------
f = Flow("form-replies-to-emailed-pictures", "Email AI pictures to people who fill in a form, with Treza and Gmail")
f.overview(
    "## Pictures from form replies, sent by email\n"
    "Share a form that asks what picture someone wants. Each reply becomes an AI image, and the person gets it in "
    "their inbox as an attachment a few seconds later. Useful for giveaways, event booths, lead magnets and "
    "classroom activities.\n\n"
    "### How it works\n"
    "1. **Picture request form** collects an email address, a description and a style.\n"
    "2. **Settings** holds the shape, the spend cap and the email text.\n"
    "3. **Make the picture** gets a quote, stops if it is over **Max Cost**, renders the image and downloads it.\n"
    "4. **Email the picture** sends it from your Gmail with the image attached.\n\n"
    "### Setup\n"
    "1. Add your Treza API credential to **Make the picture**.\n"
    "2. Connect your Google account in **Email the picture**.\n"
    "3. Activate the workflow and open the form's Production URL.\n\n"
    "### Customization\n"
    "Edit the styles in the form, change the shape or the email wording in **Settings**, or swap Gmail for "
    "Outlook or Send Email. Keep **Max Cost** low on a public form, since every reply spends credits.\n\n"
    + REQUIREMENTS,
    h=760,
)
f.section("Note: ask", (-40, -140), 460, 420, "## 1. Ask\nThe form asks for an email address, what to show and a style. **Settings** holds the shape, spend cap and email text.")
f.section("Note: make", (440, -140), 300, 420, "## 2. Make the picture\nTreza quotes the image first and stops if it costs more than Max Cost.")
f.section("Note: send", (760, -140), 300, 420, "## 3. Send it\nThe image goes out as an attachment from your Gmail.")
form = f.add("Picture request form", "n8n-nodes-base.formTrigger", 2.3, (0, 100), {
    "formTitle": "Get a picture made for you",
    "formDescription": "Describe a picture and we'll email it to you in a minute.",
    "formFields": {"values": [
        {"fieldLabel": "Email", "fieldType": "email", "placeholder": "you@example.com", "requiredField": True},
        {"fieldLabel": "What should the picture show?", "fieldType": "textarea", "placeholder": "A lighthouse on a cliff during a thunderstorm", "requiredField": True},
        {"fieldLabel": "Style", "fieldType": "dropdown", "fieldOptions": {"values": [
            {"option": "Photo"}, {"option": "Illustration"}, {"option": "Watercolor"}, {"option": "3D render"},
        ]}, "requiredField": True},
    ]},
    "responseMode": "onReceived",
    "options": {"respondWithOptions": {"values": {"formSubmittedText": "Thanks! Your picture is on its way to your inbox."}}},
}, webhookId=str(uuid.uuid5(NS, "form-replies-to-emailed-pictures/webhook")))
st = settings(f, (220, 100), [
    ("aspectRatio", "string", "1:1"),
    ("maxCostUsd", "number", 0.25),
    ("emailSubject", "string", "Your picture is ready"),
    ("emailBody", "string", "Here is the picture you asked for. Thanks for trying it!"),
], keep_input=True)
img = f.add("Make the picture", TREZA, 1, (500, 100), {
    "resource": "image",
    "operation": "generate",
    "prompt": "={{ $json['What should the picture show?'] }}, {{ $json.Style.toLowerCase() }} style",
    "maxCostUsd": "={{ $json.maxCostUsd }}",
    "additionalFields": {"aspectRatio": "={{ $json.aspectRatio }}"},
    "download": True,
    "binaryPropertyName": "picture",
})
mail = f.add("Email the picture", "n8n-nodes-base.gmail", 2.2, (820, 100), {
    "sendTo": "={{ $('Picture request form').item.json.Email }}",
    "subject": f"={{{{ {S}.emailSubject }}}}",
    "emailType": "text",
    "message": f"={{{{ {S}.emailBody }}}}",
    "options": {"appendAttribution": False, "attachmentsUi": {"attachmentsBinary": [{"property": "picture"}]}},
}, webhookId=str(uuid.uuid5(NS, "form-replies-to-emailed-pictures/gmail")))
for a, b in [(form, st), (st, img), (img, mail)]:
    f.link(a, b)
f.write()

# ---------------------------------------------------------------------------
# 4. Chat agent with Treza tools
# ---------------------------------------------------------------------------
f = Flow("chat-agent-makes-images-and-videos", "Chat with an AI agent that makes images and video clips with Treza tools")
f.overview(
    "## An AI agent that makes pictures and video clips\n"
    "Chat with an agent that can make an image or a short video clip when the conversation asks for one. It "
    "writes a detailed prompt, picks the shape, renders with Treza, and replies with the link.\n\n"
    "### How it works\n"
    "1. **Chat** receives your message in n8n's chat window.\n"
    "2. **Media agent** decides whether to answer, ask a question, or call a tool.\n"
    "3. **Make a picture** and **Make a video clip** are Treza tools. The agent fills in the prompt and shape; "
    "the spend cap is fixed on each tool, so the agent cannot spend more than you allow.\n"
    "4. **Chat memory** keeps the last messages so you can ask for changes.\n\n"
    "### Setup\n"
    "1. Add your OpenAI credential to **Chat model** (or swap in Anthropic, Gemini or another chat model).\n"
    "2. Add your Treza API credential to both Treza tools.\n"
    "3. Open the chat and ask for something, like a 16:9 picture of a neon city in the rain.\n\n"
    "### Customization\n"
    "Raise or lower **Max Cost** on each tool, change the clip length, or add more Treza tools such as Pipeline > "
    "Run to let the agent start your own Treza pipelines. Self-hosted n8n needs "
    "`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` to use community nodes as tools.\n\n"
    + REQUIREMENTS,
    h=840,
)
f.section("Note: talk", (-40, -140), 480, 600, "## 1. Talk to the agent\nThe chat model plans the answer and calls a Treza tool when you ask for media.")
f.section("Note: tools", (460, -140), 520, 600, "## 2. Treza tools\nEach tool has a fixed Max Cost, so the agent never spends more than you set.")
chat = f.add("Chat", "@n8n/n8n-nodes-langchain.chatTrigger", 1.4, (0, 100), {"options": {}}, webhookId=str(uuid.uuid5(NS, "chat-agent/webhook")))
agent = f.add("Media agent", "@n8n/n8n-nodes-langchain.agent", 3.1, (240, 100), {
    "options": {"systemMessage": (
        "You make pictures and short video clips with the Treza tools.\n"
        "- When someone asks for media, write a detailed visual prompt: subject, setting, light, camera, style.\n"
        "- Pick the shape from the request (16:9 for screens, 9:16 for phones and Shorts, 1:1 for posts).\n"
        "- Use Make a picture for images and Make a video clip for motion. Ask one short question if the request is unclear.\n"
        "- Reply with the file link and one line on what you made. If a tool says the price is over the cap, say so and suggest a cheaper option."
    )},
})
model = f.add("Chat model", "@n8n/n8n-nodes-langchain.lmChatOpenAi", 1.3, (120, 340), {"model": rl("gpt-5-mini"), "options": {}})
memory = f.add("Chat memory", "@n8n/n8n-nodes-langchain.memoryBufferWindow", 1.3, (300, 340), {"contextWindowLength": 10})
pic = f.add("Make a picture", TREZA_TOOL, 1, (560, 340), {
    "descriptionType": "manual",
    "toolDescription": "Makes one AI image from a detailed prompt and returns its link.",
    "resource": "image",
    "operation": "generate",
    "prompt": "={{ $fromAI('prompt', 'A detailed description of the picture: subject, setting, light, style', 'string') }}",
    "maxCostUsd": 0.25,
    "additionalFields": {"aspectRatio": "={{ $fromAI('aspectRatio', 'Shape of the picture: 16:9, 9:16, 1:1, 4:5 or 3:2', 'string') }}"},
})
vid = f.add("Make a video clip", TREZA_TOOL, 1, (780, 340), {
    "descriptionType": "manual",
    "toolDescription": "Makes one short AI video clip (about 4 seconds) from a detailed prompt and returns its link. Takes a minute or two.",
    "resource": "video",
    "operation": "generate",
    "prompt": "={{ $fromAI('prompt', 'A detailed description of the shot: subject, action, camera move, light, style', 'string') }}",
    "aspectRatio": "={{ $fromAI('aspectRatio', 'Shape of the clip: 16:9, 9:16 or 1:1', 'string') }}",
    "durationSec": 4,
    "maxCostUsd": 1,
    "additionalFields": {"withAudio": False},
})
f.link(chat, agent)
f.link(model, agent, "ai_languageModel")
f.link(memory, agent, "ai_memory")
f.link(pic, agent, "ai_tool")
f.link(vid, agent, "ai_tool")
f.write()

# ---------------------------------------------------------------------------
# 5. Daily pipeline run -> Google Drive -> Slack
# ---------------------------------------------------------------------------
f = Flow("daily-pipeline-to-drive-and-slack", "Run a Treza video pipeline every morning, save the video to Google Drive and share it in Slack")
f.overview(
    "## Your Treza pipeline every morning, filed and shared\n"
    "Runs one of your Treza pipelines on a schedule, saves the finished video to a Google Drive folder with a "
    "dated name, and posts the Drive link in Slack. Good for a daily Short, a news recap or any recurring edit "
    "your team reviews before posting.\n\n"
    "### How it works\n"
    "1. **Every morning** starts the workflow at 8:00.\n"
    "2. **Settings** holds the spend cap and the file name prefix.\n"
    "3. **Run the pipeline** gets a quote, stops if it is over **Max Cost**, waits for the render and downloads "
    "the video.\n"
    "4. **Save to Google Drive** uploads it as `<prefix> <date>.mp4`.\n"
    "5. **Share in Slack** posts the Drive link to a channel.\n\n"
    "### Setup\n"
    "1. Build or pick a pipeline at trezalabs.com and choose it in **Run the pipeline**.\n"
    "2. Add your Treza, Google Drive and Slack credentials.\n"
    "3. Pick the Drive folder and the Slack channel, then activate.\n\n"
    "### Customization\n"
    "Change the time in **Every morning**, map new inputs into the pipeline (a topic from a sheet, a feed item), "
    "or replace Slack with email. For long renders, raise **Timeout** on the Treza node.\n\n"
    + REQUIREMENTS,
    h=700,
)
f.section("Note: run", (-40, -140), 720, 420, "## 1. Run the pipeline\nOn schedule, Treza quotes the run, stops if it is over Max Cost, renders it and downloads the video.")
f.section("Note: share", (700, -140), 520, 420, "## 2. File and share\nThe video is saved to Drive with a dated name, then the Drive link is posted in Slack.")
sched = f.add("Every morning", "n8n-nodes-base.scheduleTrigger", 1.2, (0, 100), {"rule": {"interval": [{"triggerAtHour": 8}]}})
st = settings(f, (220, 100), [
    ("maxCostUsd", "number", 5),
    ("fileNamePrefix", "string", "Daily video"),
])
run = f.add("Run the pipeline", TREZA, 1, (460, 100), {
    "resource": "pipeline",
    "operation": "run",
    "pipelineId": rl(),
    "maxCostUsd": f"={{{{ {S}.maxCostUsd }}}}",
    "download": True,
    "binaryPropertyName": "video",
})
drive = f.add("Save to Google Drive", "n8n-nodes-base.googleDrive", 3, (760, 100), {
    "inputDataFieldName": "video",
    "name": f"={{{{ {S}.fileNamePrefix }}}} {{{{ $now.toFormat('yyyy-MM-dd') }}}}.mp4",
    "driveId": rl("My Drive"),
    "folderId": {**rl("root"), "cachedResultName": "/ (Root folder)"},
    "options": {},
})
slack = f.add("Share in Slack", "n8n-nodes-base.slack", 2.3, (1000, 100), {
    "select": "channel",
    "channelId": rl(),
    "text": "=Today's video is ready: {{ $json.webViewLink }}",
    "otherOptions": {},
}, webhookId=str(uuid.uuid5(NS, "daily-pipeline/slack")))
for a, b in [(sched, st), (st, run), (run, drive), (drive, slack)]:
    f.link(a, b)
f.write()

print("\n".join(sorted(p.name for p in OUT.glob("*.json"))))
