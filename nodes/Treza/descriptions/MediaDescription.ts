import type { INodeProperties } from 'n8n-workflow';
import { waitFields } from './shared';

const edit = { resource: ['media'], operation: ['edit'] };
const importUrl = { resource: ['media'], operation: ['importFromUrl'] };
const upload = { resource: ['media'], operation: ['upload'] };

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Edit',
				value: 'edit',
				description:
					'Run edits over a video, image or audio file: captions, upscale, background removal, trim, overlay and more',
				action: 'Edit a media file',
			},
			{
				name: 'Import From URL',
				value: 'importFromUrl',
				description: 'Add a file at a public link to your Treza library',
				action: 'Import a media file from a URL',
			},
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a binary file from this workflow to your Treza library',
				action: 'Upload a media file',
			},
		],
		default: 'edit',
	},
];

export const mediaFields: INodeProperties[] = [
	// ----------------------------------------------------------------------
	//                              media:edit
	// ----------------------------------------------------------------------
	{
		displayName: 'Source URL',
		name: 'sourceUrl',
		type: 'string',
		required: true,
		default: '',
		description:
			'The file to edit: a URL from your Treza library, an earlier render, or Media → Upload / Import From URL',
		displayOptions: { show: edit },
	},
	{
		displayName: 'Edits',
		name: 'operations',
		type: 'fixedCollection',
		required: true,
		default: {},
		placeholder: 'Add Edit',
		typeOptions: { multipleValues: true, sortable: true },
		description: 'The edits to run, in order. Each one works on the result of the one before.',
		displayOptions: { show: edit },
		options: [
			{
				displayName: 'Edit',
				name: 'edit',
				values: [
					{
						displayName: 'Type Name or ID',
						name: 'nodeType',
						type: 'options',
						default: '',
						typeOptions: { loadOptionsMethod: 'getEditNodeTypes' },
						description:
							'The edit to run. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Settings (JSON)',
						name: 'config',
						type: 'json',
						default: '{}',
						description:
							'The settings for this edit. Leave as {} for the defaults. Treza lists the valid ones if a setting is wrong.',
					},
					{
						displayName: 'Extra Inputs (JSON)',
						name: 'inputs',
						type: 'json',
						default: '{}',
						description:
							'Extra files or text on a named input, e.g. {"image": "https://..."} for an overlay or {"audio": "https://..."} for lipsync',
					},
				],
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: edit },
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'What to call the render in Treza',
			},
		],
	},
	...waitFields(edit),

	// ----------------------------------------------------------------------
	//                              media:importFromUrl
	// ----------------------------------------------------------------------
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/clip.mp4',
		description:
			'A public HTTPS link to an image (up to 25 MB), video (200 MB) or audio file (100 MB)',
		displayOptions: { show: importUrl },
	},

	// ----------------------------------------------------------------------
	//                              media:upload
	// ----------------------------------------------------------------------
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input binary field containing the file to upload',
		displayOptions: { show: upload },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description: 'What to call the file in your Treza library. Defaults to the file name.',
		displayOptions: { show: { resource: ['media'], operation: ['importFromUrl', 'upload'] } },
	},
];
