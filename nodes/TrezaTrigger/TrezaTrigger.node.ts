import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { pipelineLocator } from '../Treza/descriptions/shared';
import { omit, primaryUrl, toNodeError, trezaRequest } from '../Treza/GenericFunctions';
import { searchPipelines } from '../Treza/methods';

/** How many finished run ids to remember, so a run is emitted once. */
const SEEN_LIMIT = 200;

interface PollState {
	pipelineId?: string;
	seen?: string[];
}

export class TrezaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Treza Trigger',
		name: 'trezaTrigger',
		icon: { light: 'file:../../icons/treza.svg', dark: 'file:../../icons/treza.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '=Run finished',
		description: 'Starts the workflow when a run of a Treza pipeline finishes',
		defaults: { name: 'Treza Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'trezaApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Finished',
						value: 'runFinished',
						description: 'A run of the pipeline ended, from the canvas, the API, a schedule or another workflow',
					},
				],
				default: 'runFinished',
			},
			pipelineLocator({}, 'The pipeline to watch'),
			{
				displayName: 'Statuses',
				name: 'statuses',
				type: 'multiOptions',
				options: [
					{ name: 'Cancelled', value: 'cancelled' },
					{ name: 'Failed', value: 'error' },
					{ name: 'Partly Finished', value: 'partial', description: 'Some steps finished and some failed' },
					{ name: 'Succeeded', value: 'success' },
				],
				default: ['success'],
				description: 'Which endings start the workflow',
			},
			{
				displayName: 'Include Outputs',
				name: 'includeOutputs',
				type: 'boolean',
				default: true,
				description:
					'Whether to fetch each run in full, with its output files. Off gives only the run ID, status and times.',
			},
		],
	};

	methods = { listSearch: { searchPipelines } };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const pipelineId = (this.getNodeParameter('pipelineId', '', { extractValue: true }) as string).trim();
		const statuses = this.getNodeParameter('statuses', []) as string[];
		const includeOutputs = this.getNodeParameter('includeOutputs', true) as boolean;
		const state = this.getWorkflowStaticData('node') as PollState;
		const manual = this.getMode() === 'manual';

		let runs: IDataObject[];
		try {
			const listing = await trezaRequest.call(this, 'list_runs', { pipelineId, limit: 50 });
			runs = (listing.runs ?? []) as IDataObject[];
		} catch (error) {
			throw toNodeError.call(this, error);
		}
		const finished = runs.filter((run) => run.status !== 'running');
		const matching = finished.filter((run) => statuses.includes(String(run.status)));

		let emit: IDataObject[];
		if (manual) {
			// "Fetch Test Event": the newest matching run, whether seen or not.
			emit = matching.slice(0, 1);
		} else if (state.pipelineId !== pipelineId || !state.seen) {
			// First poll for this pipeline: runs that ended before the workflow
			// was turned on are history, not events.
			state.pipelineId = pipelineId;
			state.seen = finished.map((run) => String(run.runId)).slice(0, SEEN_LIMIT);
			return null;
		} else {
			const seen = new Set(state.seen);
			emit = matching.filter((run) => !seen.has(String(run.runId))).reverse();
			const newlyFinished = finished.map((run) => String(run.runId)).filter((id) => !seen.has(id));
			state.seen = [...newlyFinished, ...state.seen].slice(0, SEEN_LIMIT);
		}
		if (emit.length === 0) return null;

		const items: INodeExecutionData[] = [];
		for (const run of emit) {
			if (!includeOutputs) {
				items.push({ json: { pipelineId, ...run } });
				continue;
			}
			try {
				const full = await trezaRequest.call(this, 'get_run', { pipelineId, runId: run.runId as string });
				// Per-step detail and polling hints are noise in a trigger item.
				const url = primaryUrl(full);
				items.push({ json: { ...omit(full, ['nodes', 'pollAfterSec']), ...(url ? { url } : {}) } });
			} catch (error) {
				throw toNodeError.call(this, error);
			}
		}
		return [items];
	}
}
