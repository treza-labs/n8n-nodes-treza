import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { accountOperations } from './descriptions/AccountDescription';
import { imageFields, imageOperations } from './descriptions/ImageDescription';
import { mediaFields, mediaOperations } from './descriptions/MediaDescription';
import { pipelineFields, pipelineOperations } from './descriptions/PipelineDescription';
import { runFields, runOperations } from './descriptions/RunDescription';
import { videoFields, videoOperations } from './descriptions/VideoDescription';
import {
	compact,
	downloadFile,
	finishRender,
	isRefusal,
	primaryUrl,
	requestIdFor,
	runJson,
	toList,
	toNodeError,
	trezaRequest,
} from './GenericFunctions';
import { getEditNodeTypes, getEntryNodes, getImageModels, searchPipelines } from './methods';

/** The upload types Treza's library takes (create_upload_url). */
const UPLOAD_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'video/mp4',
	'video/quicktime',
	'video/webm',
	'audio/mpeg',
	'audio/mp4',
	'audio/wav',
	'audio/ogg',
];

/** Quote refusals that a fresh quote fixes: another render took the scratch pipeline in between. */
const STALE_QUOTE_CODES = ['STALE_QUOTE', 'QUOTE_MISMATCH', 'UNKNOWN_QUOTE'];

type Output = { json: IDataObject; binary?: Record<string, IBinaryData> };

export class Treza implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Treza',
		name: 'treza',
		icon: { light: 'file:../../icons/treza.svg', dark: 'file:../../icons/treza.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Generate videos and images, edit footage, and run Treza pipelines',
		defaults: { name: 'Treza' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'trezaApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Image', value: 'image' },
					{ name: 'Media', value: 'media' },
					{ name: 'Pipeline', value: 'pipeline' },
					{ name: 'Run', value: 'run' },
					{ name: 'Video', value: 'video' },
				],
				default: 'video',
			},
			...accountOperations,
			...imageOperations,
			...imageFields,
			...mediaOperations,
			...mediaFields,
			...pipelineOperations,
			...pipelineFields,
			...runOperations,
			...runFields,
			...videoOperations,
			...videoFields,
		],
	};

	methods = {
		listSearch: { searchPipelines },
		loadOptions: { getEditNodeTypes, getEntryNodes, getImageModels },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		// get_pipeline answers, per pipeline, for typing Run inputs.
		const entryTypes = new Map<string, Map<string, string>>();

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const outputs = await runOperation.call(this, resource, operation, i, entryTypes);
				for (const output of outputs) returnData.push({ ...output, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: toNodeError.call(this, error, i).message }, pairedItem: { item: i } });
					continue;
				}
				throw toNodeError.call(this, error, i);
			}
		}

		return [returnData];
	}
}

function waitOptions(this: IExecuteFunctions, i: number, toggle = true) {
	const wait = toggle ? (this.getNodeParameter('waitForCompletion', i) as boolean) : true;
	return {
		wait,
		timeoutMinutes: wait ? (this.getNodeParameter('timeoutMinutes', i) as number) : 0,
		download: wait ? (this.getNodeParameter('download', i) as boolean) : false,
		binaryPropertyName: wait ? (this.getNodeParameter('binaryPropertyName', i, 'data') as string) : 'data',
	};
}

function pipelineIdParam(this: IExecuteFunctions, i: number): string {
	return (this.getNodeParameter('pipelineId', i, '', { extractValue: true }) as string).trim();
}

/**
 * Start a render at a price no higher than Max Cost. `quote` prepares it
 * (make_video, make_image or estimate_run_cost) and answers with the price and
 * a quoteId; the run starts only at that quoted price, once. Nothing is
 * charged when the price is over the cap or the balance is short.
 */
async function startQuoted(
	this: IExecuteFunctions,
	i: number,
	maxCostUsd: number,
	quote: () => Promise<IDataObject>,
	inputs?: IDataObject,
): Promise<{ quoted: IDataObject; started: IDataObject; pipelineId: string }> {
	for (let attempt = 0; ; attempt++) {
		let quoted: IDataObject;
		try {
			quoted = await quote();
		} catch (error) {
			if (isRefusal(error, 'OVER_BUDGET')) throw overBudget.call(this, i, Number(error.body.estimatedChargeUsd), maxCostUsd);
			throw toNodeError.call(this, error, i);
		}
		const pipelineId = String(quoted.pipelineId);
		const price = Number(quoted.estimatedChargeUsd);
		if (!(price <= maxCostUsd)) throw overBudget.call(this, i, price, maxCostUsd);
		if (quoted.sufficient === false) {
			throw new NodeOperationError(
				this.getNode(),
				`This render costs $${price.toFixed(2)} and your Treza balance is $${Number(quoted.balanceUsd ?? 0).toFixed(2)}. Nothing was charged.`,
				{ itemIndex: i, description: typeof quoted.topUpUrl === 'string' ? `Add credits at ${quoted.topUpUrl}` : undefined },
			);
		}

		const args: IDataObject = { pipelineId, ...(inputs ? { inputs } : {}) };
		if (typeof quoted.quoteId === 'string') args.quoteId = quoted.quoteId;
		else args.requestId = requestIdFor.call(this, i);
		try {
			const started = await trezaRequest.call(this, 'run_pipeline', args);
			return { quoted, started, pipelineId };
		} catch (error) {
			if (attempt < 2 && isRefusal(error, ...STALE_QUOTE_CODES)) continue;
			// The run's own inputs can price it above the canvas the quote was for.
			// Still under the cap, it runs unquoted, once per item.
			if (isRefusal(error, 'PRICE_CHANGED') && Number(error.body.estimatedChargeUsd) <= maxCostUsd) {
				const started = await trezaRequest.call(this, 'run_pipeline', {
					pipelineId,
					...(inputs ? { inputs } : {}),
					requestId: requestIdFor.call(this, i),
				});
				return { quoted: { ...quoted, estimatedChargeUsd: error.body.estimatedChargeUsd }, started, pipelineId };
			}
			if (isRefusal(error, 'PRICE_CHANGED')) {
				throw overBudget.call(this, i, Number(error.body.estimatedChargeUsd), maxCostUsd);
			}
			throw toNodeError.call(this, error, i);
		}
	}
}

function overBudget(this: IExecuteFunctions, i: number, priceUsd: number, maxCostUsd: number): NodeOperationError {
	const price = Number.isFinite(priceUsd) ? `$${priceUsd.toFixed(2)}` : 'more';
	return new NodeOperationError(
		this.getNode(),
		`This render costs ${price}, over the Max Cost of $${maxCostUsd.toFixed(2)}. Nothing was charged.`,
		{ itemIndex: i, description: 'Raise Max Cost, or ask for less (a shorter clip, a cheaper model).' },
	);
}

/** What a quote said about the render, for the output item. */
function quoteSummary(quoted: IDataObject): IDataObject {
	return compact({
		estimatedChargeUsd: quoted.estimatedChargeUsd as number,
		model: (quoted.model as IDataObject | undefined)?.id as string,
		durationSec: quoted.durationSec as number,
		aspectRatio: quoted.aspectRatio as string,
	});
}

async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
	entryTypes: Map<string, Map<string, string>>,
): Promise<Output[]> {
	// ------------------------------------------------------------------ video
	if (resource === 'video' && operation === 'generate') {
		const maxCostUsd = this.getNodeParameter('maxCostUsd', i) as number;
		const args = compact({
			prompt: this.getNodeParameter('prompt', i) as string,
			aspectRatio: this.getNodeParameter('aspectRatio', i) as string,
			durationSec: this.getNodeParameter('durationSec', i) as number,
			maxPriceUsd: maxCostUsd,
			...(this.getNodeParameter('additionalFields', i) as IDataObject),
		});
		const { quoted, started, pipelineId } = await startQuoted.call(this, i, maxCostUsd, () =>
			trezaRequest.call(this, 'make_video', args),
		);
		return [
			await finishRender.call(this, i, { ...quoteSummary(quoted), ...started }, pipelineId, String(started.runId), 'video', waitOptions.call(this, i)),
		];
	}

	if (resource === 'video' && operation === 'assemble') {
		const clipUrls = toList(this.getNodeParameter('clipUrls', i));
		if (clipUrls.length === 0) {
			throw new NodeOperationError(this.getNode(), 'Add at least one clip URL', { itemIndex: i });
		}
		const started = await trezaRequest.call(
			this,
			'assemble_video',
			compact({
				clipUrls,
				...(this.getNodeParameter('additionalFields', i) as IDataObject),
				requestId: requestIdFor.call(this, i),
			}),
		);
		return [
			await finishRender.call(this, i, started, String(started.pipelineId), String(started.runId), 'video', waitOptions.call(this, i)),
		];
	}

	// ------------------------------------------------------------------ image
	if (resource === 'image' && operation === 'generate') {
		const maxCostUsd = this.getNodeParameter('maxCostUsd', i) as number;
		const { referenceImageUrls, ...additional } = this.getNodeParameter('additionalFields', i) as IDataObject;
		const references = toList(referenceImageUrls);
		const args = compact({
			prompt: this.getNodeParameter('prompt', i) as string,
			aspectRatio: this.getNodeParameter('aspectRatio', i) as string,
			maxPriceUsd: maxCostUsd,
			...additional,
			...(references.length ? { referenceImageUrls: references } : {}),
		});
		const { quoted, started, pipelineId } = await startQuoted.call(this, i, maxCostUsd, () =>
			trezaRequest.call(this, 'make_image', args),
		);
		return [
			await finishRender.call(this, i, { ...quoteSummary(quoted), ...started }, pipelineId, String(started.runId), 'image', waitOptions.call(this, i)),
		];
	}

	// ------------------------------------------------------------------ media
	if (resource === 'media' && operation === 'edit') {
		const edits = ((this.getNodeParameter('operations', i) as IDataObject).edit ?? []) as IDataObject[];
		if (edits.length === 0) {
			throw new NodeOperationError(this.getNode(), 'Add at least one edit', { itemIndex: i });
		}
		const operations = edits.map((edit, n) => ({
			nodeType: String(edit.nodeType ?? '').trim(),
			config: parseJsonField.call(this, edit.config, `Settings of edit ${n + 1}`, i),
			inputs: parseJsonField.call(this, edit.inputs, `Extra Inputs of edit ${n + 1}`, i),
		}));
		const started = await trezaRequest.call(
			this,
			'edit_asset',
			compact({
				sourceUrl: this.getNodeParameter('sourceUrl', i) as string,
				operations,
				...(this.getNodeParameter('additionalFields', i) as IDataObject),
				requestId: requestIdFor.call(this, i),
			}),
		);
		return [
			await finishRender.call(this, i, started, String(started.pipelineId), String(started.runId), 'media', waitOptions.call(this, i)),
		];
	}

	if (resource === 'media' && operation === 'importFromUrl') {
		const imported = await trezaRequest.call(
			this,
			'import_media',
			compact({ url: this.getNodeParameter('url', i) as string, name: this.getNodeParameter('name', i, '') as string }),
		);
		return [{ json: imported }];
	}

	if (resource === 'media' && operation === 'upload') {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
		const file = this.helpers.assertBinaryData(i, binaryPropertyName);
		const contentType = (file.mimeType ?? '').split(';')[0].trim().toLowerCase();
		if (!UPLOAD_TYPES.includes(contentType)) {
			throw new NodeOperationError(this.getNode(), `Treza can't take a ${contentType || 'file of unknown type'}`, {
				itemIndex: i,
				description: `Supported types: ${UPLOAD_TYPES.join(', ')}`,
			});
		}
		const target = await trezaRequest.call(this, 'create_upload_url', { contentType });
		await this.helpers.httpRequest({
			method: 'PUT',
			url: String(target.uploadUrl),
			body: await this.helpers.getBinaryDataBuffer(i, binaryPropertyName),
			headers: { 'Content-Type': contentType },
		});
		const imported = await trezaRequest.call(
			this,
			'import_media',
			compact({
				url: String(target.mediaUrl),
				name: (this.getNodeParameter('name', i, '') as string) || file.fileName,
			}),
		);
		return [{ json: imported }];
	}

	// --------------------------------------------------------------- pipeline
	if (resource === 'pipeline' && operation === 'run') {
		const pipelineId = pipelineIdParam.call(this, i);
		const maxCostUsd = this.getNodeParameter('maxCostUsd', i) as number;
		const inputs = await pipelineInputs.call(this, pipelineId, i, entryTypes);
		const { quoted, started } = await startQuoted.call(
			this,
			i,
			maxCostUsd,
			() => trezaRequest.call(this, 'estimate_run_cost', { pipelineId }),
			inputs,
		);
		return [
			await finishRender.call(
				this,
				i,
				{ estimatedChargeUsd: quoted.estimatedChargeUsd, ...started },
				pipelineId,
				String(started.runId),
				undefined,
				waitOptions.call(this, i),
			),
		];
	}

	if (resource === 'pipeline' && operation === 'estimateCost') {
		return [{ json: await trezaRequest.call(this, 'estimate_run_cost', { pipelineId: pipelineIdParam.call(this, i) }) }];
	}

	if (resource === 'pipeline' && operation === 'getMany') {
		const { pipelines } = await trezaRequest.call(this, 'list_pipelines');
		const all = (pipelines ?? []) as IDataObject[];
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = returnAll ? all.length : (this.getNodeParameter('limit', i) as number);
		return all.slice(0, limit).map((json) => ({ json }));
	}

	// -------------------------------------------------------------------- run
	if (resource === 'run') {
		const pipelineId = pipelineIdParam.call(this, i);

		if (operation === 'get') {
			const runId = this.getNodeParameter('runId', i) as string;
			const run = await trezaRequest.call(this, 'get_run', { pipelineId, runId });
			const json = runJson({}, run);
			const download = this.getNodeParameter('download', i) as boolean;
			const url = primaryUrl(run);
			if (!download || !url || run.status === 'running') return [{ json }];
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			return [{ json, binary: { [binaryPropertyName]: await downloadFile.call(this, url) } }];
		}

		if (operation === 'getMany') {
			const limit = Math.min(this.getNodeParameter('limit', i) as number, 50);
			const { runs } = await trezaRequest.call(this, 'list_runs', { pipelineId, limit });
			return ((runs ?? []) as IDataObject[]).map((run) => ({ json: { pipelineId, ...run } }));
		}

		if (operation === 'cancel') {
			const runId = this.getNodeParameter('runId', i, '') as string;
			return [{ json: await trezaRequest.call(this, 'cancel_run', compact({ pipelineId, runId })) }];
		}

		if (operation === 'wait') {
			const runId = this.getNodeParameter('runId', i) as string;
			return [await finishRender.call(this, i, {}, pipelineId, runId, undefined, waitOptions.call(this, i, false))];
		}
	}

	// ---------------------------------------------------------------- account
	if (resource === 'account' && operation === 'getBalance') {
		return [{ json: await trezaRequest.call(this, 'get_credit_balance') }];
	}

	throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported for ${resource}`, {
		itemIndex: i,
	});
}

/** A JSON parameter as an object: {} when empty, an error naming the field when not JSON. */
function parseJsonField(this: IExecuteFunctions, value: unknown, label: string, i: number): IDataObject {
	if (value && typeof value === 'object') return value as IDataObject;
	const text = String(value ?? '').trim();
	if (!text) return {};
	try {
		const parsed = JSON.parse(text) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as IDataObject;
	} catch {
		// Reported below.
	}
	throw new NodeOperationError(this.getNode(), `${label} must be a JSON object`, { itemIndex: i });
}

/**
 * The Run inputs keyed by input step. An HTTP Payload step takes JSON, so its
 * value is parsed when it reads as JSON; the others take the text as it is.
 */
async function pipelineInputs(
	this: IExecuteFunctions,
	pipelineId: string,
	i: number,
	entryTypes: Map<string, Map<string, string>>,
): Promise<IDataObject | undefined> {
	const rows = ((this.getNodeParameter('inputs', i, {}) as IDataObject).input ?? []) as IDataObject[];
	if (rows.length === 0) return undefined;

	let types = entryTypes.get(pipelineId);
	if (!types) {
		const { entryNodes } = await trezaRequest.call(this, 'get_pipeline', { pipelineId });
		types = new Map(((entryNodes ?? []) as IDataObject[]).map((node) => [String(node.id), String(node.type)]));
		entryTypes.set(pipelineId, types);
	}

	const inputs: IDataObject = {};
	for (const row of rows) {
		const key = String(row.entryNodeId ?? '').trim();
		if (!key) throw new NodeOperationError(this.getNode(), 'Pick the input step for every input', { itemIndex: i });
		let value: unknown = row.value ?? '';
		if (types.get(key) === 'webhook-trigger' && typeof value === 'string') {
			try {
				value = JSON.parse(value);
			} catch {
				// Plain text is a valid JSON payload value too.
			}
		}
		inputs[key] = value as IDataObject[keyof IDataObject];
	}
	return inputs;
}
