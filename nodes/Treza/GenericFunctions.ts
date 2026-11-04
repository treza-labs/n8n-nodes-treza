import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep, sleepUnlessExecutionCancelled } from 'n8n-workflow';

import { version } from '../../package.json';

/** Sent as the User-Agent, so Treza can tell n8n traffic apart. */
const USER_AGENT = `n8n-nodes-treza/${version}`;

type Context = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions | IHookFunctions;

/**
 * A refusal from Treza: the HTTP status and the JSON body, which carries
 * `error` (written to be read by a person) and often a `code` to branch on.
 */
export class TrezaRefusal extends Error {
	constructor(
		readonly status: number,
		readonly body: IDataObject,
	) {
		super(typeof body.error === 'string' ? body.error : `Treza answered HTTP ${status}`);
		this.name = 'TrezaRefusal';
	}

	get code(): string | undefined {
		return typeof this.body.code === 'string' ? this.body.code : undefined;
	}
}

export function isRefusal(error: unknown, ...codes: string[]): error is TrezaRefusal {
	return error instanceof TrezaRefusal && (codes.length === 0 || codes.includes(error.code ?? ''));
}

export async function baseUrl(this: Context): Promise<string> {
	const credentials = await this.getCredentials('trezaApi');
	const url = typeof credentials.baseUrl === 'string' && credentials.baseUrl ? credentials.baseUrl : 'https://www.trezalabs.com';
	return url.replace(/\/+$/, '');
}

/**
 * Call one Treza tool: `POST /api/v1/tools/<tool>` with the arguments as the
 * body. The REST API is the MCP server's tools over plain HTTP, so the
 * answers and refusals are the same ones an agent gets.
 */
export async function trezaRequest(this: Context, tool: string, args: IDataObject = {}): Promise<IDataObject> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'trezaApi', {
		method: 'POST',
		url: `${await baseUrl.call(this)}/api/v1/tools/${tool}`,
		body: args,
		json: true,
		headers: { 'User-Agent': USER_AGENT },
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as IN8nHttpFullResponse;

	const body = (response.body && typeof response.body === 'object' ? response.body : { error: String(response.body ?? '') }) as IDataObject;
	if (response.statusCode >= 400) throw new TrezaRefusal(response.statusCode, body);
	return body;
}

/** Turn whatever a call threw into the error n8n shows on the node. */
export function toNodeError(this: IExecuteFunctions | IPollFunctions, error: unknown, itemIndex?: number): Error {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	if (error instanceof TrezaRefusal) {
		const { body } = error;
		const extra: string[] = [];
		if (typeof body.note === 'string') extra.push(body.note);
		if (typeof body.topUpUrl === 'string') extra.push(`Add credits at ${body.topUpUrl}`);
		return new NodeApiError(this.getNode(), body as JsonObject, {
			message: error.message,
			description: extra.join(' ') || undefined,
			httpCode: String(error.status),
			itemIndex,
		});
	}
	return new NodeApiError(this.getNode(), { message: (error as Error)?.message ?? String(error) } as JsonObject, {
		itemIndex,
	});
}

/** Wait `ms`, ending early (with an error) if the execution is stopped. */
async function pause(context: IExecuteFunctions, ms: number): Promise<void> {
	// sleepUnlessExecutionCancelled is missing from older n8n versions.
	if (typeof sleepUnlessExecutionCancelled === 'function') await sleepUnlessExecutionCancelled(context, ms);
	else await sleep(ms);
}

/** A failure worth polling through: the network, a 5xx, or a rate limit. */
function transient(error: unknown): boolean {
	if (error instanceof TrezaRefusal) return error.status >= 500 || error.status === 429;
	return true;
}

export interface WaitResult {
	run: IDataObject;
	timedOut: boolean;
}

/**
 * Poll `get_run` until the run leaves "running", at the pace Treza asks for
 * (`pollAfterSec`). A timeout is not an error: the render carries on, and
 * failing here would let n8n's Retry On Fail start a second, paid render.
 * Stopping the execution while it waits stops the render too.
 */
export async function waitForRun(
	this: IExecuteFunctions,
	pipelineId: string,
	runId: string,
	timeoutMinutes: number,
): Promise<WaitResult> {
	const deadline = Date.now() + timeoutMinutes * 60_000;
	// onExecutionCancellation is missing from older n8n versions. Once the run
	// has ended, cancel_run answers alreadyFinished and changes nothing.
	if (typeof this.onExecutionCancellation === 'function') {
		this.onExecutionCancellation(() => trezaRequest.call(this, 'cancel_run', { pipelineId, runId }).catch(() => undefined));
	}
	let failures = 0;
	for (;;) {
		let run: IDataObject;
		try {
			run = await trezaRequest.call(this, 'get_run', { pipelineId, runId });
			failures = 0;
		} catch (error) {
			if (!transient(error) || ++failures > 5) throw toNodeError.call(this, error);
			run = { status: 'running', pollAfterSec: 10 };
		}
		if (run.status !== 'running') return { run, timedOut: false };
		if (Date.now() >= deadline) return { run, timedOut: true };

		const asked = Number(run.pollAfterSec) || 10;
		const ms = Math.min(Math.max(asked, 3), 30) * 1000;
		await pause(this, Math.max(1000, Math.min(ms, deadline - Date.now())));
	}
}

/** Why a finished run failed, from the notes and the first step that broke. */
function failureMessage(run: IDataObject): string {
	if (run.status === 'cancelled') {
		return `The render was cancelled${typeof run.cancelReason === 'string' ? `: ${run.cancelReason}` : ''}`;
	}
	const nodes = Array.isArray(run.nodes) ? (run.nodes as IDataObject[]) : [];
	const broken = nodes.find((node) => typeof node.error === 'string');
	const reasons = [run.statusNote, run.refusalNote, broken && `${String(broken.label ?? broken.type)}: ${String(broken.error)}`];
	return `The render failed. ${reasons.filter((reason) => typeof reason === 'string' && reason).join(' ')}`.trim();
}

/** The finished file: the named output, or else the first URL among the outputs. */
export function primaryUrl(run: IDataObject, key?: string): string | undefined {
	const outputs = (run.outputs ?? {}) as IDataObject;
	if (key && typeof outputs[key] === 'string') return outputs[key] as string;
	return Object.values(outputs).find((value): value is string => typeof value === 'string' && /^https?:\/\//.test(value));
}

/**
 * The item for a render: what started it (price, model, warnings) plus the
 * run, with the finished file's URL up front as `url`.
 */
export function runJson(started: IDataObject, run: IDataObject | undefined, outputKey?: string, timedOut = false): IDataObject {
	const json: IDataObject = { ...started };
	delete json.note;
	if (!run) return json;
	// pollAfterSec only paces polling, so it is left out.
	Object.assign(json, omit(run, ['nodes', 'pollAfterSec', 'progress']));
	const url = primaryUrl(run, outputKey);
	if (url) json.url = url;
	if (run.status === 'running') json.progress = run.progress;
	// A partial run finished some steps and not others; say which.
	if (run.status === 'partial') json.nodes = run.nodes;
	if (timedOut) json.timedOut = true;
	return json;
}

/** Wait for a run if asked, fail on a failed run, and download the file if asked. */
export async function finishRender(
	this: IExecuteFunctions,
	itemIndex: number,
	started: IDataObject,
	pipelineId: string,
	runId: string,
	outputKey: string | undefined,
	opts: { wait: boolean; timeoutMinutes: number; download: boolean; binaryPropertyName: string },
): Promise<{ json: IDataObject; binary?: Record<string, IBinaryData> }> {
	const base = { ...started, pipelineId, runId };
	if (!opts.wait) return { json: runJson(base, undefined) };
	const { run, timedOut } = await waitForRun.call(this, pipelineId, runId, opts.timeoutMinutes);
	if (!timedOut && (run.status === 'error' || run.status === 'cancelled')) {
		throw new NodeOperationError(this.getNode(), failureMessage(run), {
			itemIndex,
			description: `Run ${runId} on pipeline ${pipelineId}`,
		});
	}
	const json = runJson(base, run, outputKey, timedOut);
	if (!opts.download || timedOut || typeof json.url !== 'string') return { json };
	return { json, binary: { [opts.binaryPropertyName]: await downloadFile.call(this, json.url) } };
}

/** Fetch a finished file into n8n binary data. */
export async function downloadFile(this: IExecuteFunctions, url: string): Promise<IBinaryData> {
	const response = (await this.helpers.httpRequest({
		method: 'GET',
		url,
		encoding: 'arraybuffer',
		returnFullResponse: true,
	})) as IN8nHttpFullResponse;
	const mimeType = String(response.headers['content-type'] ?? '').split(';')[0] || undefined;
	const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'treza-output');
	return await this.helpers.prepareBinaryData(Buffer.from(response.body as ArrayBuffer), fileName, mimeType);
}

/**
 * An id for one item of one execution of this node, for the tools that start
 * a render without a quote: n8n's Retry On Fail sends it again, and Treza
 * hands back the render it already started instead of charging for another.
 */
export function requestIdFor(this: IExecuteFunctions, itemIndex: number): string | undefined {
	const executionId = this.getExecutionId();
	if (!executionId) return undefined;
	return `n8n-${executionId}-${this.getNode().id}-${itemIndex}`.slice(0, 128);
}

/** Lines of text (or a list from an expression) as a clean list of strings. */
export function toList(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
	return raw.map((entry) => String(entry).trim()).filter(Boolean);
}

/** `object` without `keys`. */
export function omit(object: IDataObject, keys: string[]): IDataObject {
	return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
}

/** Drop empty strings, so an untouched optional field is left to Treza's default. */
export function compact(fields: IDataObject): IDataObject {
	return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== '' && value !== undefined && value !== null));
}
