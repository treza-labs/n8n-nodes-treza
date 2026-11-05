import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

export type Show = NonNullable<IDisplayOptions['show']>;

/** The pipeline picker: from the account's list, or a pasted id. */
export function pipelineLocator(show: Show, description = 'The Treza pipeline'): INodeProperties {
	return {
		displayName: 'Pipeline',
		name: 'pipelineId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description,
		...(Object.keys(show).length ? { displayOptions: { show } } : {}),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchPipelines', searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'pipeline_1793066179976_2cpsw1tcx',
			},
		],
	};
}

/**
 * The spend cap every operation that renders asks for. Nobody approves a price
 * inside an automation, so this is the approval: the node gets Treza's quote
 * first and stops, with nothing charged, when it is higher.
 */
export function maxCostField(show: Show, defaultUsd: number): INodeProperties {
	return {
		displayName: 'Max Cost (USD)',
		name: 'maxCostUsd',
		type: 'number',
		required: true,
		default: defaultUsd,
		typeOptions: { minValue: 0, numberPrecision: 2 },
		description:
			'The most this item may spend. The node gets the price from Treza first and stops without charging anything if the price is higher.',
		displayOptions: { show },
	};
}

/** n8n's Simplify switch, for items with more than 10 fields. */
export function simplifyField(show: Show): INodeProperties {
	return {
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show },
	};
}

/**
 * Wait for the render, and what to do with the finished file. With `toggle`
 * off (Run → Wait for Completion) waiting is the whole operation, so there is
 * no switch to turn it off.
 */
export function waitFields(show: Show, toggle = true): INodeProperties[] {
	const waiting: Show = toggle ? { ...show, waitForCompletion: [true] } : show;
	const fields: INodeProperties[] = [
		simplifyField(waiting),
		{
			displayName: 'Download Output',
			name: 'download',
			type: 'boolean',
			default: false,
			description: 'Whether to download the finished file into the item as binary data',
			displayOptions: { show: waiting },
		},
		{
			displayName: 'Put Output File in Field',
			name: 'binaryPropertyName',
			type: 'string',
			default: 'data',
			hint: 'The name of the output binary field to put the file in',
			displayOptions: { show: { ...waiting, download: [true] } },
		},
		{
			displayName: 'Timeout (Minutes)',
			name: 'timeoutMinutes',
			type: 'number',
			default: 30,
			typeOptions: { minValue: 1, maxValue: 240 },
			description:
				'How long to wait before giving up. The render keeps going on Treza; pick it up later with Run → Wait for Completion.',
			displayOptions: { show: waiting },
		},
	];
	if (!toggle) return fields;
	return [
		{
			displayName: 'Wait for Completion',
			name: 'waitForCompletion',
			type: 'boolean',
			default: true,
			description:
				'Whether to wait until the render finishes and output the finished file. Turn off to output the run ID straight away and check on it later with Run → Wait for Completion.',
			displayOptions: { show },
		},
		...fields,
	];
}
