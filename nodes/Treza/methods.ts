import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';
import { baseUrl, trezaRequest } from './GenericFunctions';

const ENTRY_TYPE_LABELS: Record<string, string> = {
	'text-input': 'Text',
	'webhook-trigger': 'JSON',
	file: 'File URL',
};

/** The pipeline picked in a resource locator (or typed as an id). */
function selectedPipelineId(context: ILoadOptionsFunctions): string {
	const locator = context.getCurrentNodeParameter('pipelineId') as { value?: string } | string | undefined;
	return (typeof locator === 'string' ? locator : locator?.value ?? '').trim();
}

export async function searchPipelines(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const { pipelines } = await trezaRequest.call(this, 'list_pipelines');
	const wanted = filter?.toLowerCase();
	const results = ((pipelines ?? []) as IDataObject[])
		.filter((pipeline) => !wanted || String(pipeline.name ?? '').toLowerCase().includes(wanted))
		.map((pipeline) => ({
			name: String(pipeline.name || pipeline.id),
			value: String(pipeline.id),
			url: `https://www.trezalabs.com/platform/pipelines/${String(pipeline.id)}`,
		}));
	return { results };
}

/** The pipeline's input steps: a Text Input, an HTTP Payload or a File. */
export async function getEntryNodes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const pipelineId = selectedPipelineId(this);
	if (!pipelineId) return [];
	const { entryNodes } = await trezaRequest.call(this, 'get_pipeline', { pipelineId });
	return ((entryNodes ?? []) as IDataObject[]).map((node) => {
		const type = String(node.type);
		const kind = ENTRY_TYPE_LABELS[type] ?? type;
		return {
			name: `${String(node.label || node.id)} (${kind})`,
			value: String(node.id),
			description: `Step ${String(node.id)}`,
		};
	});
}

/** Node types that work on a file: every type that is not a pipeline's start or end. */
export async function getEditNodeTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const { nodeTypes } = await trezaRequest.call(this, 'list_node_types');
	return ((nodeTypes ?? []) as IDataObject[])
		.filter((type) => !type.isEntry && !type.isExit && type.category !== 'input' && type.category !== 'output')
		.map((type) => ({
			name: String(type.label || type.type),
			value: String(type.type),
			description: String(type.description ?? ''),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The image models make_image takes, read from the public tool listing so
 * the list is always the live one.
 */
export async function getImageModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const listing = (await this.helpers.httpRequestWithAuthentication.call(this, 'trezaApi', {
		method: 'GET',
		url: `${await baseUrl.call(this)}/api/v1/tools`,
		json: true,
	})) as {
		tools?: Array<{ name: string; inputSchema?: { properties?: { model?: { enum?: string[] } } } }>;
	};
	const models = listing.tools?.find((tool) => tool.name === 'make_image')?.inputSchema?.properties?.model?.enum ?? [];
	return [
		{ name: 'Default (Nano Banana)', value: '' },
		...models.map((model) => ({ name: model, value: model })).sort((a, b) => a.name.localeCompare(b.name)),
	];
}
