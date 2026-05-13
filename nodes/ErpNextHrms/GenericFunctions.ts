import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export interface FrappeListOptions {
	apiVersion?: 'v1' | 'v2';
	fields?: string[];
	filters?: unknown;
	limitStart?: number;
	limitPageLength?: number;
	orderBy?: string;
}

type FrappeContext = IExecuteFunctions | ILoadOptionsFunctions;

function normalizeSiteUrl(siteUrl: string): string {
	return siteUrl.replace(/\/+$/, '');
}

function parseJsonParameter(value: unknown, parameterName: string): unknown {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}

	if (typeof value !== 'string') {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		throw new Error(`Parameter "${parameterName}" must be valid JSON.`);
	}
}

export function getDocType(resource: string, customDocType?: string): string {
	if (resource === 'customDocType') {
		if (!customDocType) {
			throw new Error('Custom DocType is required.');
		}
		return customDocType;
	}

	const docTypes: Record<string, string> = {
		employee: 'Employee',
		attendance: 'Attendance',
		employeeCheckin: 'Employee Checkin',
		leaveApplication: 'Leave Application',
		leaveAllocation: 'Leave Allocation',
		expenseClaim: 'Expense Claim',
		salarySlip: 'Salary Slip',
		shiftAssignment: 'Shift Assignment',
		holidayList: 'Holiday List',
	};

	const docType = docTypes[resource];
	if (!docType) {
		throw new Error(`Unsupported resource "${resource}".`);
	}

	return docType;
}

export function prepareFields(fields: string): string[] | undefined {
	const cleaned = fields
		.split(',')
		.map((field) => field.trim())
		.filter(Boolean);

	return cleaned.length > 0 ? cleaned : undefined;
}

export function prepareData(dataJson: unknown): IDataObject {
	const parsed = parseJsonParameter(dataJson, 'Data JSON');
	if (parsed === undefined) {
		return {};
	}
	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Data JSON must be an object.');
	}
	return parsed as IDataObject;
}

export function prepareFilters(filtersJson: unknown): unknown {
	return parseJsonParameter(filtersJson, 'Filters JSON');
}

export async function frappeApiRequest(
	this: FrappeContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<any> {
	const credentials = await this.getCredentials('erpNextApi');
	const baseURL = normalizeSiteUrl(credentials.siteUrl as string);

	const options: IHttpRequestOptions = {
		method,
		baseURL,
		url: endpoint,
		body,
		qs,
		json: true,
		skipSslCertificateValidation: credentials.allowUnauthorizedCerts as boolean,
	};

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'erpNextApi', options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as any);
	}
}

function getDocumentEndpoint(apiVersion: 'v1' | 'v2', docType: string, name?: string): string {
	const encodedDocType = encodeURIComponent(docType);
	if (apiVersion === 'v2') {
		const base = `/api/v2/document/${encodedDocType}`;
		return name ? `${base}/${encodeURIComponent(name)}/` : base;
	}

	const base = `/api/resource/${encodedDocType}`;
	return name ? `${base}/${encodeURIComponent(name)}` : base;
}

function getMethodEndpoint(apiVersion: 'v1' | 'v2', methodName: string): string {
	return apiVersion === 'v2' ? `/api/v2/method/${methodName}` : `/api/method/${methodName}`;
}

export async function frappeGetDoc(
	this: IExecuteFunctions,
	docType: string,
	name: string,
	apiVersion: 'v1' | 'v2' = 'v1',
): Promise<IDataObject> {
	const response = await frappeApiRequest.call(this, 'GET', getDocumentEndpoint(apiVersion, docType, name));
	return response.data;
}

export async function frappeGetManyDocs(
	this: IExecuteFunctions,
	docType: string,
	options: FrappeListOptions,
): Promise<IDataObject[]> {
	const qs: IDataObject = {};

	if (options.fields) {
		qs.fields = JSON.stringify(options.fields);
	}
	if (options.filters) {
		qs.filters = JSON.stringify(options.filters);
	}
	if (options.apiVersion === 'v2') {
		if (options.limitStart !== undefined) {
			qs.start = options.limitStart;
		}
		if (options.limitPageLength !== undefined) {
			qs.limit = options.limitPageLength;
		}
	} else {
		if (options.limitStart !== undefined) {
			qs.limit_start = options.limitStart;
		}
		if (options.limitPageLength !== undefined) {
			qs.limit_page_length = options.limitPageLength;
		}
	}
	if (options.orderBy) {
		qs.order_by = options.orderBy;
	}

	const response = await frappeApiRequest.call(
		this,
		'GET',
		getDocumentEndpoint(options.apiVersion ?? 'v1', docType),
		{},
		qs,
	);
	return response.data;
}

export async function frappeCreateDoc(
	this: IExecuteFunctions,
	docType: string,
	data: IDataObject,
	apiVersion: 'v1' | 'v2' = 'v1',
): Promise<IDataObject> {
	const response = await frappeApiRequest.call(this, 'POST', getDocumentEndpoint(apiVersion, docType), data);
	return response.data;
}

export async function frappeUpdateDoc(
	this: IExecuteFunctions,
	docType: string,
	name: string,
	data: IDataObject,
	apiVersion: 'v1' | 'v2' = 'v1',
): Promise<IDataObject> {
	const response = await frappeApiRequest.call(
		this,
		apiVersion === 'v2' ? 'PATCH' : 'PUT',
		getDocumentEndpoint(apiVersion, docType, name),
		data,
	);
	return response.data;
}

export async function frappeDeleteDoc(
	this: IExecuteFunctions,
	docType: string,
	name: string,
	apiVersion: 'v1' | 'v2' = 'v1',
): Promise<IDataObject> {
	await frappeApiRequest.call(this, 'DELETE', getDocumentEndpoint(apiVersion, docType, name));
	return { success: true, name };
}

export async function frappeRunDocAction(
	this: IExecuteFunctions,
	action: 'submit' | 'cancel',
	doc: IDataObject,
): Promise<IDataObject> {
	const method = action === 'submit' ? 'frappe.client.submit' : 'frappe.client.cancel';
	const response = await frappeApiRequest.call(this, 'POST', `/api/method/${method}`, {
		doc,
	});
	return response.message ?? response;
}

export async function frappeRunMethod(
	this: IExecuteFunctions,
	methodName: string,
	args: IDataObject,
	apiVersion: 'v1' | 'v2' = 'v1',
): Promise<IDataObject> {
	const response = await frappeApiRequest.call(
		this,
		'POST',
		getMethodEndpoint(apiVersion, methodName),
		args,
	);
	return response.message ?? response;
}
