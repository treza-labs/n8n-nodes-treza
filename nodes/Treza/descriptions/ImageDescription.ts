import type { INodeProperties } from 'n8n-workflow';
import { maxCostField, waitFields } from './shared';

const generate = { resource: ['image'], operation: ['generate'] };

export const imageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['image'] } },
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Generate a picture from a prompt, or restyle pictures you already have',
				action: 'Generate an image',
			},
		],
		default: 'generate',
	},
];

export const imageFields: INodeProperties[] = [
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		placeholder: 'Studio product shot of a ceramic mug on warm linen, soft window light',
		description: 'What the picture shows, or with reference images, what to change about them',
		displayOptions: { show: generate },
	},
	{
		displayName: 'Aspect Ratio',
		name: 'aspectRatio',
		type: 'options',
		default: '',
		options: [
			{ name: '1:1', value: '1:1' },
			{ name: '16:9', value: '16:9' },
			{ name: '2:3', value: '2:3' },
			{ name: '21:9', value: '21:9' },
			{ name: '3:2', value: '3:2' },
			{ name: '3:4', value: '3:4' },
			{ name: '4:3', value: '4:3' },
			{ name: '4:5', value: '4:5' },
			{ name: '5:4', value: '5:4' },
			{ name: '9:16', value: '9:16' },
			{ name: "Model's Choice", value: '' },
		],
		description:
			"The picture's shape. Model's Choice gives a square, or the shape of the reference image.",
		displayOptions: { show: generate },
	},
	maxCostField(generate, 0.5),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: generate },
		options: [
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				default: '',
				typeOptions: { loadOptionsMethod: 'getImageModels' },
				description:
					'Leave empty for Nano Banana. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'What to call the render in Treza',
			},
			{
				displayName: 'Reference Image URLs',
				name: 'referenceImageUrls',
				type: 'string',
				default: '',
				typeOptions: { rows: 2 },
				description:
					'Up to 4 pictures from your Treza library for the model to work from, one URL per line. Upload a file first with Media → Upload.',
			},
		],
	},
	...waitFields(generate),
];
