import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TrezaApi implements ICredentialType {
	name = 'trezaApi';

	displayName = 'Treza API';

	icon: Icon = { light: 'file:../icons/treza.svg', dark: 'file:../icons/treza.dark.svg' };

	documentationUrl = 'https://github.com/treza-labs/n8n-nodes-treza?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'treza_live_...',
			description:
				'Make a key at https://www.trezalabs.com/platform/api-keys with the pipelines:read, pipelines:write and pipelines:run permissions',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://www.trezalabs.com',
			description: 'Leave as is unless Treza support gives you another address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/tools/get_credit_balance',
			method: 'POST',
			body: {},
			json: true,
		},
	};
}
