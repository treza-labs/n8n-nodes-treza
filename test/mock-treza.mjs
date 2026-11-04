// A stand-in for Treza's REST API (/api/v1/tools/<name>), answering with the
// shapes documented from treza-xyz origin/main, so the n8n node can be driven
// end to end without spending credits. Every call is appended to calls.log.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(dir, 'fixtures');
const PORT = Number(process.env.PORT || 4010);
const BASE = `http://localhost:${PORT}`;
const KEY = 'treza_live_mocktest';
const log = fs.createWriteStream(process.env.CALLS_LOG || path.join(dir, 'calls.log'), { flags: 'a' });

let n = 0;
const id = (p) => `${p}_${Date.now()}_${++n}`;
const now = () => new Date().toISOString();
const quotes = new Map(); // quoteId -> { pipelineId, chargeUsd, runId?, staleOnce }
const requests = new Map(); // requestId -> runId
const runs = new Map(); // runId -> run
const pipelines = new Map([
	['pipeline_demo', { id: 'pipeline_demo', name: 'Demo clipper', status: 'active', priceUsd: 1.5 }],
]);
const uploads = new Map();
let balanceUsd = 10;
const staleServed = new Set(); // "[stale:<id>]" goes stale on its first quote only, as a race would

function startRun(pipelineId, kind, extra = {}) {
	const runId = `${now()}#${Math.random().toString(16).slice(2, 10)}`;
	runs.set(runId, { runId, pipelineId, kind, polls: 0, startedAt: now(), fail: false, ...extra });
	return runId;
}

function runView(run) {
	run.polls++;
	if (run.polls <= 2 && !run.cancelled) {
		return { runId: run.runId, pipelineId: run.pipelineId, status: 'running', trigger: 'api', startedAt: run.startedAt, progress: { done: 0, total: 1, current: ['Render'] }, pollAfterSec: 3 };
	}
	const status = run.cancelled ? 'cancelled' : run.fail ? 'error' : 'success';
	const file = run.kind === 'image' ? `${BASE}/files/image.png?sig=abc` : `${BASE}/files/clip.mp4?sig=abc`;
	const key = run.kind === 'pipeline' ? 'final_cut' : run.kind;
	return {
		runId: run.runId,
		pipelineId: run.pipelineId,
		status,
		trigger: 'api',
		startedAt: run.startedAt,
		finishedAt: now(),
		durationMs: 9000,
		...(status === 'success' ? { outputs: { [key]: file }, note: 'Done.' } : {}),
		...(status === 'error' ? { statusNote: 'The video model refused the prompt.' } : {}),
		nodes: [{ nodeId: 'n1', type: 'video-gen', label: 'Video', status: status === 'success' ? 'success' : 'error', ...(status === 'error' ? { error: 'Model refused: unsafe content' } : {}) }],
	};
}

function quote(pipelineId, chargeUsd, extra = {}) {
	const quoteId = `q_${Math.random().toString(36).slice(2, 14)}`;
	quotes.set(quoteId, { pipelineId, chargeUsd, staleOnce: !!extra.staleOnce });
	return {
		pipelineId,
		pipelineName: 'Scratch',
		quoteId,
		quoteExpiresAt: new Date(Date.now() + 864e5).toISOString(),
		estimatedChargeUsd: chargeUsd,
		lines: [{ nodeId: 'n1', label: 'Video', chargeUsd }],
		balanceUsd,
		enforced: true,
		sufficient: chargeUsd <= balanceUsd,
		...(chargeUsd > balanceUsd ? { topUpUrl: 'https://www.trezalabs.com/platform/settings' } : { goAheadNote: 'Covered.' }),
	};
}

const refuse = (status, body) => ({ status, body });

function staleOnce(prompt) {
	const tag = /\[stale:(\w+)\]/.exec(prompt)?.[1];
	if (!tag || staleServed.has(tag)) return false;
	staleServed.add(tag);
	return true;
}

const tools = {
	get_credit_balance: () => ({ balanceUsd, enforced: true, topUpUrl: 'https://www.trezalabs.com/platform/settings', packs: [] }),
	make_video: (a) => {
		const durationSec = a.durationSec ?? 4;
		const price = Math.round(durationSec * 0.25 * 100) / 100;
		if (typeof a.maxPriceUsd === 'number' && price > a.maxPriceUsd) {
			return refuse(400, { error: `This video costs $${price} on Veo 3.1 Lite at ${durationSec}s, over the $${a.maxPriceUsd} limit. Nothing was created or charged.`, code: 'OVER_BUDGET', estimatedChargeUsd: price, model: 'google/veo-3.1-lite', durationSec });
		}
		const pipelineId = 'pipeline_scratch';
		pipelines.set(pipelineId, { id: pipelineId, name: 'Scratch', kind: 'video', fail: /\[fail\]/.test(a.prompt) });
		return { ...quote(pipelineId, price, { staleOnce: staleOnce(a.prompt) }), model: { id: 'google/veo-3.1-lite', name: 'Veo 3.1 Lite' }, durationSec, aspectRatio: a.aspectRatio ?? '16:9', withAudio: a.withAudio ?? true, note: 'Prepared.' };
	},
	make_image: (a) => {
		const pipelineId = 'pipeline_scratch';
		pipelines.set(pipelineId, { id: pipelineId, name: 'Scratch', kind: 'image' });
		return { ...quote(pipelineId, 0.04), model: { id: a.model || 'google/gemini-2.5-flash-image', name: 'Nano Banana' }, aspectRatio: a.aspectRatio, referenceImageUrls: a.referenceImageUrls, note: 'Prepared.' };
	},
	estimate_run_cost: (a) => {
		const p = pipelines.get(a.pipelineId);
		if (!p) return refuse(404, { error: 'Pipeline not found or access denied.' });
		return quote(a.pipelineId, p.priceUsd ?? 1);
	},
	run_pipeline: (a) => {
		const p = pipelines.get(a.pipelineId);
		if (!p) return refuse(404, { error: 'Pipeline not found or access denied.' });
		if (a.quoteId) {
			const q = quotes.get(a.quoteId);
			if (!q) return refuse(400, { error: `quoteId "${a.quoteId}" is not a current quote`, code: 'UNKNOWN_QUOTE' });
			if (q.staleOnce) {
				q.staleOnce = false;
				quotes.delete(a.quoteId);
				return refuse(400, { error: 'The pipeline changed after the quote priced it.', code: 'STALE_QUOTE', quotedChargeUsd: q.chargeUsd });
			}
			if (q.runId) return { runId: q.runId, pipelineId: a.pipelineId, status: 'running', startedAt: now(), repeat: true, note: 'Already started.' };
			if (p.id === 'pipeline_demo' && a.inputs && a.inputs.text_1 === 'long') {
				return refuse(400, { error: 'This run now costs $3.00, more than the $1.50 quote.', code: 'PRICE_CHANGED', quotedChargeUsd: 1.5, estimatedChargeUsd: 3 });
			}
			q.runId = startRun(a.pipelineId, p.kind ?? 'pipeline', { fail: p.fail, inputs: a.inputs });
			return { runId: q.runId, status: 'running', startedAt: now(), note: 'Started.' };
		}
		if (a.requestId && requests.has(a.requestId)) return { runId: requests.get(a.requestId), pipelineId: a.pipelineId, status: 'running', repeat: true, note: 'Already started.' };
		const runId = startRun(a.pipelineId, p.kind ?? 'pipeline', { inputs: a.inputs });
		if (a.requestId) requests.set(a.requestId, runId);
		return { runId, status: 'running', startedAt: now(), note: 'Started without a quote.' };
	},
	get_run: (a) => {
		const run = runs.get(a.runId);
		if (!run) return refuse(404, { error: 'Run not found.' });
		return runView(run);
	},
	list_runs: (a) => ({
		runs: [...runs.values()].filter((r) => r.pipelineId === a.pipelineId).reverse().slice(0, a.limit ?? 10).map((r) => {
			const v = runView({ ...r, polls: r.polls });
			return { runId: r.runId, status: v.status, trigger: 'api', startedAt: r.startedAt, finishedAt: v.finishedAt ?? r.startedAt, durationMs: v.durationMs ?? 0 };
		}),
	}),
	cancel_run: (a) => {
		const run = runs.get(a.runId);
		if (run) run.cancelled = true;
		return { runId: a.runId, pipelineId: a.pipelineId, status: 'cancelled', note: 'Stopped.' };
	},
	list_pipelines: () => ({ pipelines: [...pipelines.values()].map((p) => ({ id: p.id, name: p.name, status: p.status ?? 'draft', updatedAt: now(), nodeCount: 3, lastRun: { runningCount: 0, lastStatus: null, lastRunAt: null } })) }),
	get_pipeline: (a) => {
		const p = pipelines.get(a.pipelineId);
		if (!p) return refuse(404, { error: 'Pipeline not found or access denied.' });
		return { id: p.id, name: p.name, status: 'active', entryNodes: [{ id: 'text_1', type: 'text-input', label: 'Topic' }, { id: 'payload_1', type: 'webhook-trigger', label: 'Payload' }, { id: 'file_1', type: 'file', label: 'Source video' }], nodes: [], edgeCount: 2 };
	},
	assemble_video: (a) => {
		if (a.requestId && requests.has(a.requestId)) return { runId: requests.get(a.requestId), pipelineId: 'pipeline_asm', status: 'running', repeat: true, note: 'Already started.' };
		const runId = startRun('pipeline_asm', 'video');
		if (a.requestId) requests.set(a.requestId, runId);
		return { runId, pipelineId: 'pipeline_asm', status: 'running', startedAt: now(), charged: false, clips: a.clipUrls.length, lengthSec: 6, warning: a.clipUrls.length === 1 ? 'Only one clip.' : undefined, note: 'Assembling.' };
	},
	edit_asset: (a) => {
		if (a.requestId && requests.has(a.requestId)) return { runId: requests.get(a.requestId), pipelineId: 'pipeline_edit', status: 'running', repeat: true, note: 'Already started.' };
		const runId = startRun('pipeline_edit', 'media');
		if (a.requestId) requests.set(a.requestId, runId);
		return { runId, pipelineId: 'pipeline_edit', status: 'running', startedAt: now(), applied: a.operations.map((o) => o.nodeType), note: 'Editing.' };
	},
	create_upload_url: (a) => {
		const uid = id('up');
		uploads.set(uid, { contentType: a.contentType });
		return { uploadUrl: `${BASE}/upload/${uid}`, method: 'PUT', headers: { 'Content-Type': a.contentType }, expiresInSec: 900, mediaUrl: `${BASE}/uploaded/${uid}`, command: 'curl ...', note: 'PUT it.' };
	},
	import_media: (a) => {
		if (!a.url) return refuse(400, { error: 'Pass a url.', code: 'NO_SOURCE' });
		const uid = a.url.split('/').pop();
		if (a.url.startsWith(`${BASE}/uploaded/`) && !uploads.get(uid)?.bytes) return refuse(400, { error: 'Nothing was uploaded there.', code: 'NOT_UPLOADED' });
		const up = uploads.get(uid);
		return { url: `${BASE}/files/clip.mp4?lib=${uid ?? 'x'}`, kind: up?.contentType?.split('/')[0] ?? 'video', name: a.name ?? 'file', bytes: up?.bytes ?? 1234, note: 'In your library.' };
	},
	list_node_types: () => ({
		categories: [],
		nodeTypes: [
			{ type: 'text-input', label: 'Text Input', category: 'input', description: 'Text', isEntry: true },
			{ type: 'captions', label: 'Captions', category: 'transform', description: 'Burn captions in' },
			{ type: 'video-upscale', label: 'Upscale Video', category: 'transform', description: 'Upscale' },
			{ type: 'output', label: 'Output', category: 'output', description: 'Out', isExit: true },
		],
	}),
};

const listing = {
	tools: Object.keys(tools).map((name) => ({ name, inputSchema: name === 'make_image' ? { properties: { model: { enum: ['google/gemini-2.5-flash-image', 'openai/gpt-image-2', 'krea/krea-2-large'] } } } : {} })),
};

http
	.createServer(async (req, res) => {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const raw = Buffer.concat(chunks);
		const send = (status, body, type = 'application/json') => {
			res.writeHead(status, { 'content-type': type });
			res.end(type === 'application/json' ? JSON.stringify(body) : body);
		};
		const url = new URL(req.url, BASE);

		if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
			const f = url.pathname.endsWith('.png') ? 'image.png' : 'clip.mp4';
			return send(200, fs.readFileSync(path.join(fixtures, f)), f.endsWith('.png') ? 'image/png' : 'video/mp4');
		}
		if (req.method === 'PUT' && url.pathname.startsWith('/upload/')) {
			const up = uploads.get(url.pathname.split('/').pop());
			if (!up || req.headers['content-type'] !== up.contentType) return send(403, { error: 'Signature mismatch' });
			up.bytes = raw.length;
			log.write(JSON.stringify({ at: now(), put: url.pathname, bytes: raw.length, type: req.headers['content-type'] }) + '\n');
			return send(200, {});
		}
		if (req.method === 'GET' && url.pathname === '/api/v1/tools') return send(200, listing);

		const m = url.pathname.match(/^\/api\/v1\/tools\/([a-z_]+)$/);
		if (req.method !== 'POST' || !m) return send(404, { error: 'Not found' });
		const args = raw.length ? JSON.parse(raw.toString()) : {};
		log.write(JSON.stringify({ at: now(), tool: m[1], args, ua: req.headers['user-agent'], auth: req.headers.authorization === `Bearer ${KEY}` }) + '\n');
		if (req.headers.authorization !== `Bearer ${KEY}`) {
			return send(401, { error: 'Send a Treza API key as "Authorization: Bearer treza_live_...".', code: 'UNAUTHORIZED' });
		}
		const tool = tools[m[1]];
		if (!tool) return send(404, { error: `There is no tool named "${m[1]}".`, code: 'UNKNOWN_TOOL' });
		const out = tool(args);
		if (out && out.status && out.body) return send(out.status, out.body);
		return send(200, out);
	})
	.listen(PORT, () => console.log(`mock treza on ${BASE}`));

