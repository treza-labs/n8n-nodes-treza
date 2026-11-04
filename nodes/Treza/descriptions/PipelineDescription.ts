import type { INodeProperties } from 'n8n-workflow';
import { maxCostField, pipelineLocator, waitFields } from './shared';

const run = { resource: ['pipeline'], operation: ['run'] };
const getMany = { resource: ['pipeline'], operation: ['getMany'] };

export const pipelineOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['pipeline'] } },
		options: [
			{
				name: 'Estimate Cost',
				value: 'estimateCost',
				description: 'Get the price of one run of a pipeline, and whether your balance covers it',
				action: 'Estimate the cost of a pipeline run',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				description: 'List the pipelines on your Treza account',
				action: 'Get many pipelines',
			},
			{
				name: 'Run',
				value: 'run',
				description: 'Run a pipeline with new inputs',
				action: 'Run a pipeline',
			},
		],
		default: 'run',
	},
];

export const pipelineFields: INodeProperties[] = [
	pipelineLocator({ resource: ['pipeline'], operation: ['run', 'estimateCost'] }),

	// ----------------------------------------------------------------------
	//                              pipeline:run
	// ----------------------------------------------------------------------
	{
		displayName: 'Inputs',
		name: 'inputs',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Input',
		typeOptions: { multipleValues: true },
		description:
			'Values for the pipeline’s input steps. An input you leave out runs with the value saved in the pipeline.',
		displayOptions: { show: run },
		options: [
			{
				displayName: 'Input',
				name: 'input',
				values: [
					{
						displayName: 'Input Step Name or ID',
						name: 'entryNodeId',
						type: 'options',
						default: '',
						typeOptions: {
							loadOptionsMethod: 'getEntryNodes',
							loadOptionsDependsOn: ['pipelineId.value'],
						},
						description:
							'The pipeline step to feed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description:
							'Text for a Text Input step, a file URL for a File step, or JSON for an HTTP Payload step',
					},
				],
			},
		],
	},
	maxCostField(run, 5),
	...waitFields(run),

	// ----------------------------------------------------------------------
	//                              pipeline:getMany
	// ----------------------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: getMany },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { ...getMany, returnAll: [false] } },
	},
];
