// Drives the compiled Treza node's execute() against test/mock-treza.mjs,
// with a minimal stand-in for n8n's IExecuteFunctions. Run with `npm test`.
const path = require('node:path');
const fs = require('node:fs');
const { Treza } = require(path.join(__dirname, '..', 'dist/nodes/Treza/Treza.node.js'));
const LOG = process.env.CALLS_LOG;
const BASE = process.env.TREZA_BASE_URL;

function ctx(params, { key = 'treza_live_mocktest', executionId = String(Math.random()).slice(2, 8), binary } = {}) {
	const node = { id: 'node-uuid-1', name: 'Treza', type: 'n8n-nodes-treza.treza', typeVersion: 1, parameters: {} };
	async function httpRequest(o) {
		const headers = { ...(o.headers || {}) };
		let body = o.body;
		if (o.json && body && !Buffer.isBuffer(body)) {
			body = JSON.stringify(body);
			headers['content-type'] = 'application/json';
		}
		const res = await fetch(o.url, { method: o.method, headers, body: o.method === 'GET' ? undefined : body });
		const buf = Buffer.from(await res.arrayBuffer());
		let parsed = buf;
		if (o.encoding !== 'arraybuffer') {
			const text = buf.toString();
			try { parsed = JSON.parse(text); } catch { parsed = text; }
		}
		if (!o.ignoreHttpStatusErrors && res.status >= 400) throw new Error(`HTTP ${res.status}`);
		return o.returnFullResponse ? { statusCode: res.status, headers: Object.fromEntries(res.headers), body: parsed } : parsed;
	}
	const handlers = [];
	return {
		getInputData: () => [{ json: {}, binary }],
		getNodeParameter: (name, i, fallback) => {
			const v = name in params ? params[name] : fallback;
			if (v && typeof v === 'object' && '__rl' in v) return v.value;
			return v;
		},
		getNode: () => node,
		continueOnFail: () => false,
		getExecutionId: () => executionId,
		getCredentials: async () => ({ apiKey: key, baseUrl: `${BASE}/` }),
		getExecutionCancelSignal: () => undefined,
		onExecutionCancellation: (h) => handlers.push(h),
		helpers: {
			httpRequest,
			httpRequestWithAuthentication: async function (_type, o) {
				return httpRequest({ ...o, headers: { ...(o.headers || {}), Authorization: `Bearer ${key}` } });
			},
			prepareBinaryData: async (buffer, fileName, mimeType) => ({ data: buffer.toString('base64').slice(0, 16) + '…', fileName, mimeType, fileSize: String(buffer.length) }),
			assertBinaryData: (i, prop) => binary[prop],
			getBinaryDataBuffer: async (i, prop) => Buffer.from(binary[prop].data, 'base64'),
		},
	};
}

function callsSince(mark) {
	return fs.readFileSync(LOG, 'utf8').slice(mark).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function scenario(title, params, opts, check) {
	const mark = fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
	const t0 = Date.now();
	let out, err;
	try {
		out = await new Treza().execute.call(ctx(params, opts));
	} catch (e) {
		err = e;
	}
	const calls = callsSince(mark);
	let verdict;
	try {
		verdict = check({ out: out && out[0], err, calls }) ? 'PASS' : 'FAIL';
	} catch (e) {
		verdict = `FAIL (${e.message})`;
	}
	if (verdict !== 'PASS') process.exitCode = 1;
	console.log(`\n[${verdict}] ${title}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
	console.log('  calls:', calls.map((c) => c.tool || `PUT ${c.bytes}B ${c.type}`).join(' → '));
	if (err) console.log('  error:', err.constructor.name, '|', err.message, err.description ? `| ${err.description}` : '');
	if (out) console.log('  item:', JSON.stringify(out[0].map((x) => ({ json: x.json, binary: x.binary }))).slice(0, 700));
	return { out, err, calls };
}

const wait = { waitForCompletion: true, timeoutMinutes: 5, download: false, binaryPropertyName: 'data' };
const rl = (value) => ({ __rl: true, mode: 'id', value });

(async () => {
	await scenario('Video Generate: quote under cap → run → wait → download',
		{ resource: 'video', operation: 'generate', prompt: 'otter', aspectRatio: '9:16', durationSec: 4, maxCostUsd: 2, additionalFields: {}, ...wait, download: true },
		{}, ({ out, calls }) => out[0].json.url && out[0].binary.data.mimeType === 'video/mp4' && out[0].json.estimatedChargeUsd === 1 && calls.find((c) => c.tool === 'make_video').args.maxPriceUsd === 2 && calls.every((c) => !c.tool || c.ua.startsWith('n8n-nodes-treza/')));

	await scenario('Video Generate: over Max Cost → refused, nothing run',
		{ resource: 'video', operation: 'generate', prompt: 'otter', aspectRatio: '16:9', durationSec: 8, maxCostUsd: 1, additionalFields: {}, ...wait },
		{}, ({ err, calls }) => /costs \$2\.00, over the Max Cost of \$1\.00\. Nothing was charged/.test(err.message) && !calls.some((c) => c.tool === 'run_pipeline'));

	await scenario('Video Generate: stale quote (another render took the scratch pipeline) → re-quoted once',
		{ resource: 'video', operation: 'generate', prompt: 'otter [stale:1]', aspectRatio: '16:9', durationSec: 4, maxCostUsd: 2, additionalFields: {}, ...wait },
		{}, ({ out, calls }) => out[0].json.status === 'success' && calls.filter((c) => c.tool === 'make_video').length === 2);

	await scenario('Video Generate: render fails → node error with the reason',
		{ resource: 'video', operation: 'generate', prompt: 'otter [fail]', aspectRatio: '16:9', durationSec: 4, maxCostUsd: 2, additionalFields: {}, ...wait },
		{}, ({ err }) => /stopped before it finished/.test(err.message) && /refused/.test(err.message) && !/\b(error|fail)/i.test(err.message));

	await scenario('Video Generate: wait times out → item with timedOut, no error (Retry On Fail cannot double-charge)',
		{ resource: 'video', operation: 'generate', prompt: 'otter', aspectRatio: '16:9', durationSec: 4, maxCostUsd: 2, additionalFields: {}, ...wait, timeoutMinutes: 0.02 },
		{}, ({ out }) => out[0].json.timedOut === true && out[0].json.status === 'running' && out[0].json.runId);

	await scenario('Video Generate: Simplify (default) → at most 10 fields, no chat notes',
		{ resource: 'video', operation: 'generate', prompt: 'otter', aspectRatio: '16:9', durationSec: 4, maxCostUsd: 2, additionalFields: {}, ...wait },
		{}, ({ out }) => Object.keys(out[0].json).length <= 10 && out[0].json.url && out[0].json.runId && !('note' in out[0].json) && !('startedAt' in out[0].json));

	await scenario('Video Generate: Simplify off → the full run, still no chat notes',
		{ resource: 'video', operation: 'generate', prompt: 'otter', aspectRatio: '16:9', durationSec: 4, maxCostUsd: 2, additionalFields: {}, ...wait, simplify: false },
		{}, ({ out }) => out[0].json.url && out[0].json.startedAt && out[0].json.finishedAt && !('note' in out[0].json) && !('canvasDefaults' in out[0].json));

	await scenario('Video Generate: Wait for Completion off → run id straight away',
		{ resource: 'video', operation: 'generate', prompt: 'otter', aspectRatio: '16:9', durationSec: 4, maxCostUsd: 2, additionalFields: {}, waitForCompletion: false },
		{}, ({ out, calls }) => out[0].json.runId && out[0].json.pipelineId === 'pipeline_scratch' && !calls.some((c) => c.tool === 'get_run'));

	await scenario('Image Generate with references (lines → list)',
		{ resource: 'image', operation: 'generate', prompt: 'mug', aspectRatio: '', maxCostUsd: 0.5, additionalFields: { referenceImageUrls: 'https://a/1.png\nhttps://a/2.png', model: '' }, ...wait },
		{}, ({ out, calls }) => {
			const args = calls.find((c) => c.tool === 'make_image').args;
			return out[0].json.url.includes('image.png') && args.referenceImageUrls.length === 2 && !('aspectRatio' in args) && !('model' in args);
		});

	await scenario('Pipeline Run: typed inputs (JSON payload parsed), quoted',
		{ resource: 'pipeline', operation: 'run', pipelineId: rl('pipeline_demo'), maxCostUsd: 5, inputs: { input: [{ entryNodeId: 'text_1', value: 'hello' }, { entryNodeId: 'payload_1', value: '{"a":1}' }] }, ...wait },
		{}, ({ out, calls }) => {
			const run = calls.find((c) => c.tool === 'run_pipeline').args;
			return out[0].json.url && run.quoteId && run.inputs.payload_1.a === 1 && run.inputs.text_1 === 'hello';
		});

	await scenario('Pipeline Run: inputs raise the price (PRICE_CHANGED) but still under cap → runs once by requestId',
		{ resource: 'pipeline', operation: 'run', pipelineId: rl('pipeline_demo'), maxCostUsd: 5, inputs: { input: [{ entryNodeId: 'text_1', value: 'long' }] }, ...wait },
		{}, ({ out, calls }) => out[0].json.estimatedChargeUsd === 3 && calls.filter((c) => c.tool === 'run_pipeline').length === 2 && calls.filter((c) => c.tool === 'run_pipeline')[1].args.requestId);

	await scenario('Pipeline Run: inputs raise the price over the cap → refused',
		{ resource: 'pipeline', operation: 'run', pipelineId: rl('pipeline_demo'), maxCostUsd: 2, inputs: { input: [{ entryNodeId: 'text_1', value: 'long' }] }, ...wait },
		{}, ({ err, calls }) => /costs \$3\.00, over the Max Cost of \$2\.00/.test(err.message) && calls.filter((c) => c.tool === 'run_pipeline').length === 1);

	const exec = 'exec-42';
	const asm = { resource: 'video', operation: 'assemble', clipUrls: 'https://a/1.mp4\nhttps://a/2.mp4', additionalFields: { musicPrompt: 'calm piano', captions: true }, waitForCompletion: false };
	const first = await scenario('Assemble: sends a requestId', asm, { executionId: exec }, ({ out, calls }) => out[0].json.runId && calls[0].args.requestId === 'n8n-exec-42-node-uuid-1-0' && calls[0].args.clipUrls.length === 2);
	await scenario('Assemble: Retry On Fail in the same execution → same render, not a new one', asm, { executionId: exec }, ({ out }) => out[0].json.repeat === true && out[0].json.runId === first.out[0][0].json.runId);

	await scenario('Media Edit: edits with JSON settings',
		{ resource: 'media', operation: 'edit', sourceUrl: 'https://a/1.mp4', operations: { edit: [{ nodeType: 'captions', config: '{"style":"bold"}', inputs: '{}' }, { nodeType: 'video-upscale', config: '{}', inputs: '' }] }, additionalFields: {}, ...wait },
		{}, ({ out, calls }) => out[0].json.url && calls[0].args.operations[0].config.style === 'bold' && calls[0].args.operations.length === 2);

	const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.mp4'));
	await scenario('Media Upload: binary → signed PUT → import',
		{ resource: 'media', operation: 'upload', binaryPropertyName: 'data', name: '' },
		{ binary: { data: { data: clip.toString('base64'), mimeType: 'video/mp4', fileName: 'clip.mp4' } } },
		({ out, calls }) => out[0].json.url && calls.some((c) => c.put && c.bytes === clip.length) && calls.find((c) => c.tool === 'import_media').args.name === 'clip.mp4');

	await scenario('Media Upload: unsupported type → clear error, nothing uploaded',
		{ resource: 'media', operation: 'upload', binaryPropertyName: 'data', name: '' },
		{ binary: { data: { data: 'AAAA', mimeType: 'application/pdf', fileName: 'x.pdf' } } },
		({ err, calls }) => /can't take a application\/pdf/.test(err.message) && calls.length === 0);

	await scenario('Account Get Balance with a bad key → 401 as a NodeApiError',
		{ resource: 'account', operation: 'getBalance' }, { key: 'treza_live_wrong' },
		({ err }) => err.constructor.name === 'NodeApiError' && /API key/.test(err.message));

	await scenario('Run Get Many', { resource: 'run', operation: 'getMany', pipelineId: rl('pipeline_demo'), limit: 50 }, {},
		({ out }) => out.length >= 2 && out.every((x) => x.json.pipelineId === 'pipeline_demo'));
})();
