import type { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Balance',
				value: 'getBalance',
				description: 'Get your prepaid credit balance and the link to top it up',
				action: 'Get the credit balance',
			},
		],
		default: 'getBalance',
	},
];
