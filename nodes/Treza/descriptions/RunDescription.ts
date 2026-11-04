import type { INodeProperties } from 'n8n-workflow';
import { pipelineLocator, waitFields } from './shared';

const get = { resource: ['run'], operation: ['get'] };
const getMany = { resource: ['run'], operation: ['getMany'] };
const cancel = { resource: ['run'], operation: ['cancel'] };
const wait = { resource: ['run'], operation: ['wait'] };

export const runOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['run'] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				description: 'Stop a render that is still going',
				action: 'Cancel a run',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get the status and outputs of a run',
				action: 'Get a run',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				description: 'List recent runs of a pipeline, newest first',
				action: 'Get many runs',
			},
			{
				name: 'Wait for Completion',
				value: 'wait',
				description: 'Wait until a run finishes and output its result',
				action: 'Wait for a run to finish',
			},
		],
		default: 'get',
	},
];

export const runFields: INodeProperties[] = [
	pipelineLocator(
		{ resource: ['run'] },
		'The pipeline the run belongs to. Every render operation outputs its pipelineId and runId.',
	),
	{
		displayName: 'Run ID',
		name: 'runId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['run'], operation: ['get', 'wait'] } },
	},
	{
		displayName: 'Run ID',
		name: 'runId',
		type: 'string',
		default: '',
		description: 'The run to stop. Leave empty for the newest run that is still going.',
		displayOptions: { show: cancel },
	},
	...waitFields(wait, false),
	{
		displayName: 'Download Output',
		name: 'download',
		type: 'boolean',
		default: false,
		description: 'Whether to download the finished file into the item as binary data',
		displayOptions: { show: get },
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		hint: 'The name of the output binary field to put the file in',
		displayOptions: { show: { ...get, download: [true] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 50 },
		description: 'Max number of results to return',
		displayOptions: { show: getMany },
	},
];
