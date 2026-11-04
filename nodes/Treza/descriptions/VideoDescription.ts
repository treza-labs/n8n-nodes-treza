import type { INodeProperties } from 'n8n-workflow';
import { maxCostField, waitFields } from './shared';

const generate = { resource: ['video'], operation: ['generate'] };
const assemble = { resource: ['video'], operation: ['assemble'] };

export const videoOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['video'] } },
		options: [
			{
				name: 'Assemble',
				value: 'assemble',
				description:
					'Join clips or images into one video, with music, narration, captions and transitions',
				action: 'Assemble a video',
			},
			{
				name: 'Generate',
				value: 'generate',
				description: 'Generate a video clip from a prompt',
				action: 'Generate a video',
			},
		],
		default: 'generate',
	},
];

export const videoFields: INodeProperties[] = [
	// ----------------------------------------------------------------------
	//                              video:generate
	// ----------------------------------------------------------------------
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		placeholder: 'A sea otter floating on its back at sunrise, cracking a shell on its chest',
		description: 'What the video shows',
		displayOptions: { show: generate },
	},
	{
		displayName: 'Aspect Ratio',
		name: 'aspectRatio',
		type: 'options',
		default: '16:9',
		options: [
			{ name: 'Horizontal (16:9)', value: '16:9' },
			{ name: 'Vertical (9:16)', value: '9:16', description: 'Shorts, Reels and TikTok' },
			{ name: 'Square (1:1)', value: '1:1' },
		],
		displayOptions: { show: generate },
	},
	{
		displayName: 'Duration (Seconds)',
		name: 'durationSec',
		type: 'number',
		default: 4,
		typeOptions: { minValue: 1, maxValue: 60 },
		description:
			'Length of the clip. A model that renders fixed lengths uses the next one up, at most 2 seconds longer.',
		displayOptions: { show: generate },
	},
	maxCostField(generate, 2),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: generate },
		options: [
			{
				displayName: 'Continue From Video URL',
				name: 'continueFromVideoUrl',
				type: 'string',
				default: '',
				description:
					'A video in your Treza library to continue. Its last frame becomes the first frame of the new clip, so the two cut together.',
			},
			{
				displayName: 'First Frame URL',
				name: 'firstFrameUrl',
				type: 'string',
				default: '',
				description: 'A picture in your Treza library for the clip to open on, to animate a still',
			},
			{
				displayName: 'Last Frame URL',
				name: 'lastFrameUrl',
				type: 'string',
				default: '',
				description: 'A picture in your Treza library for the clip to end on',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: '',
				placeholder: 'google/veo-3.1-lite',
				description:
					'A video model ID. Leave empty for Treza to pick one that renders the shape and length you asked for.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'What to call the render in Treza',
			},
			{
				displayName: 'With Audio',
				name: 'withAudio',
				type: 'boolean',
				default: true,
				description: 'Whether to generate sound with the video, on models that can',
			},
		],
	},
	...waitFields(generate),

	// ----------------------------------------------------------------------
	//                              video:assemble
	// ----------------------------------------------------------------------
	{
		displayName: 'Clip URLs',
		name: 'clipUrls',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		placeholder: 'https://...\nhttps://...',
		description:
			'Videos or images from your Treza library or earlier renders, in play order. One URL per line, or an expression that returns a list.',
		displayOptions: { show: assemble },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: assemble },
		options: [
			{
				displayName: 'Burn In Captions',
				name: 'captions',
				type: 'boolean',
				default: false,
				description: 'Whether to transcribe the finished edit and burn captions in',
			},
			{
				displayName: 'Fade In (Seconds)',
				name: 'fadeInSec',
				type: 'number',
				default: 0,
				description: 'Fade the opening up from black, picture and music together',
			},
			{
				displayName: 'Fade Out (Seconds)',
				name: 'fadeOutSec',
				type: 'number',
				default: 0,
				description: 'Fade the ending to black and silence',
			},
			{
				displayName: 'Music Fade In (Seconds)',
				name: 'audioFadeInSec',
				type: 'number',
				default: 0,
				description: 'Fade the music up at the start',
			},
			{
				displayName: 'Music Fade Out (Seconds)',
				name: 'audioFadeOutSec',
				type: 'number',
				default: 0,
				description: 'Fade the music down at the end, leaving the picture as it is',
			},
			{
				displayName: 'Music Prompt',
				name: 'musicPrompt',
				type: 'string',
				default: '',
				placeholder: 'calm cinematic ambient, soft piano, no vocals',
				description: 'Compose a music bed for this cut. Use this or Music URL, not both.',
			},
			{
				displayName: 'Music URL',
				name: 'musicUrl',
				type: 'string',
				default: '',
				description: 'A music track from your Treza library to lay under the edit',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'What to call the render in Treza',
			},
			{
				displayName: 'Narration URL',
				name: 'narrationUrl',
				type: 'string',
				default: '',
				description: 'A voiceover from your Treza library. Everything else ducks under it.',
			},
			{
				displayName: 'Orientation',
				name: 'orientation',
				type: 'options',
				default: 'match_first',
				options: [
					{ name: 'Match First Clip', value: 'match_first' },
					{ name: 'Vertical (1080x1920)', value: 'vertical' },
					{ name: 'Horizontal (1920x1080)', value: 'horizontal' },
				],
			},
			{
				displayName: 'Still Image Motion',
				name: 'stillMotion',
				type: 'options',
				default: 'none',
				options: [
					{ name: 'Ken Burns', value: 'ken_burns' },
					{ name: 'None', value: 'none' },
					{ name: 'Pan Down', value: 'pan_down' },
					{ name: 'Pan Left', value: 'pan_left' },
					{ name: 'Pan Right', value: 'pan_right' },
					{ name: 'Pan Up', value: 'pan_up' },
					{ name: 'Pull Out', value: 'pull_out' },
					{ name: 'Push In', value: 'push_in' },
				],
				description: 'A slow camera move over each still image',
			},
			{
				displayName: 'Still Image Seconds',
				name: 'stillSeconds',
				type: 'number',
				default: 3,
				description: 'How long each still image holds',
			},
			{
				displayName: 'Transition',
				name: 'transition',
				type: 'options',
				default: 'none',
				options: [
					{ name: 'Dip to Black', value: 'fadeblack' },
					{ name: 'Fade', value: 'fade' },
					{ name: 'Hard Cut', value: 'none' },
					{ name: 'Wipe Left', value: 'wipeleft' },
					{ name: 'Zoom In', value: 'zoomin' },
				],
				description: 'How each shot hands off to the next',
			},
		],
	},
	...waitFields(assemble),
];
