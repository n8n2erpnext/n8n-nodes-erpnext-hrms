import type {
	ICredentialType,
	INodeProperties,
	Icon,
	IAuthenticateGeneric,
} from 'n8n-workflow';

export class ErpNextApi implements ICredentialType {
	name = 'erpNextApi';

	displayName = 'ERPNext API';

	documentationUrl = 'https://frappeframework.com/docs/user/en/api/rest';

	icon: Icon = 'file:erpnext.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'Site URL',
			name: 'siteUrl',
			type: 'string',
			default: '',
			placeholder: 'https://erp.example.com',
			required: true,
			description: 'Base URL of your Frappe/ERPNext site',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'API Secret',
			name: 'apiSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'Ignore SSL Issues',
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			default: false,
			description: 'Whether to connect even if the site uses a self-signed or invalid TLS certificate',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=token {{$credentials.apiKey}}:{{$credentials.apiSecret}}',
			},
		},
	};

	test = {
		request: {
			baseURL: '={{$credentials.siteUrl.replace(/\\/$/, "")}}',
			url: '/api/method/frappe.auth.get_logged_user',
			method: 'GET' as const,
		},
	};
}
