import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	frappeCreateDoc,
	frappeDeleteDoc,
	frappeGetDoc,
	frappeGetManyDocs,
	frappeRunDocAction,
	frappeRunMethod,
	frappeUpdateDoc,
	getDocType,
	prepareData,
	prepareFields,
	prepareFilters,
} from './GenericFunctions';

const hrmsResources: INodePropertyOptions[] = [
	{ name: 'Employee', value: 'employee' },
	{ name: 'Attendance', value: 'attendance' },
	{ name: 'Employee Checkin', value: 'employeeCheckin' },
	{ name: 'Expense Claim', value: 'expenseClaim' },
	{ name: 'Holiday List', value: 'holidayList' },
	{ name: 'Leave Allocation', value: 'leaveAllocation' },
	{ name: 'Leave Application', value: 'leaveApplication' },
	{ name: 'Salary Slip', value: 'salarySlip' },
	{ name: 'Shift Assignment', value: 'shiftAssignment' },
	{ name: 'Custom DocType', value: 'customDocType' },
	{ name: 'Frappe Method', value: 'frappeMethod' },
];

const docOperations: INodePropertyOptions[] = [
	{
		name: 'Create',
		value: 'create',
		description: 'Create a document',
		action: 'Create a document',
	},
	{
		name: 'Delete',
		value: 'delete',
		description: 'Delete a document',
		action: 'Delete a document',
	},
	{
		name: 'Get',
		value: 'get',
		description: 'Get a document by name',
		action: 'Get a document',
	},
	{
		name: 'Get Many',
		value: 'getMany',
		description: 'List documents',
		action: 'Get many documents',
	},
	{
		name: 'Submit',
		value: 'submit',
		description: 'Submit a submittable document',
		action: 'Submit a document',
	},
	{
		name: 'Cancel',
		value: 'cancel',
		description: 'Cancel a submitted document',
		action: 'Cancel a document',
	},
	{
		name: 'Update',
		value: 'update',
		description: 'Update a document',
		action: 'Update a document',
	},
];

export class ErpNextHrms implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ERPNext HRMS',
		name: 'erpNextHrms',
		icon: 'file:erpnext-hrms.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Work with ERPNext/Frappe HRMS v15-v16 documents and methods',
		defaults: {
			name: 'ERPNext HRMS',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'erpNextApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: hrmsResources,
				default: 'employee',
			},
			{
				displayName: 'API Version',
				name: 'apiVersion',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'v1 - /api/resource (Stable)',
						value: 'v1',
					},
					{
						name: 'v2 - /api/v2/document (Frappe v16)',
						value: 'v2',
					},
				],
				default: 'v1',
				description: 'Frappe REST API version to use for document and method requests',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					hide: {
						resource: ['frappeMethod'],
					},
				},
				options: docOperations,
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['frappeMethod'],
					},
				},
				options: [
					{
						name: 'Run Method',
						value: 'runMethod',
						description: 'Call a whitelisted Frappe method',
						action: 'Run a frappe method',
					},
				],
				default: 'runMethod',
			},
			{
				displayName: 'Custom DocType',
				name: 'customDocType',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Job Applicant',
				displayOptions: {
					show: {
						resource: ['customDocType'],
					},
				},
			},
			{
				displayName: 'Document Name',
				name: 'documentName',
				type: 'string',
				default: '',
				required: true,
				description: 'The Frappe document name, usually the document ID',
				displayOptions: {
					show: {
						operation: ['get', 'update', 'delete', 'submit', 'cancel'],
					},
					hide: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Data JSON',
				name: 'dataJson',
				type: 'json',
				default: '{}',
				required: true,
				description: 'Document payload as JSON',
				displayOptions: {
					show: {
						operation: ['create', 'update'],
					},
					hide: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'string',
				default: '["name"]',
				description:
					'Comma-separated fields to return, or a JSON-style list without needing filters syntax. Example: name,employee_name,status',
				displayOptions: {
					show: {
						operation: ['getMany'],
					},
					hide: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Filters JSON',
				name: 'filtersJson',
				type: 'json',
				default: '[]',
				description:
					'Frappe filters JSON. Example: [["status","=","Active"]] or {"employee":"HR-EMP-0001"}.',
				displayOptions: {
					show: {
						operation: ['getMany'],
					},
					hide: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['getMany'],
					},
					hide: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: {
					minValue: 1,
					maxValue: 1000,
				},
				displayOptions: {
					show: {
						operation: ['getMany'],
						returnAll: [false],
					},
					hide: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'string',
				default: 'modified desc',
				placeholder: 'modified desc',
				displayOptions: {
					show: {
						operation: ['getMany'],
					},
					hide: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Method Name',
				name: 'methodName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'frappe.client.get_value',
				description: 'Full dotted path of a whitelisted Frappe method',
				displayOptions: {
					show: {
						resource: ['frappeMethod'],
					},
				},
			},
			{
				displayName: 'Arguments JSON',
				name: 'argumentsJson',
				type: 'json',
				default: '{}',
				description: 'Arguments passed as request body to /api/method/{method}',
				displayOptions: {
					show: {
						resource: ['frappeMethod'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				let response: IDataObject | IDataObject[];

				if (resource === 'frappeMethod') {
					const apiVersion = this.getNodeParameter('apiVersion', itemIndex) as 'v1' | 'v2';
					const methodName = this.getNodeParameter('methodName', itemIndex) as string;
					const args = prepareData(this.getNodeParameter('argumentsJson', itemIndex));
					response = await frappeRunMethod.call(this, methodName, args, apiVersion);
				} else {
					const apiVersion = this.getNodeParameter('apiVersion', itemIndex) as 'v1' | 'v2';
					const customDocType = this.getNodeParameter('customDocType', itemIndex, '') as string;
					const docType = getDocType(resource, customDocType);

					if (operation === 'get') {
						const documentName = this.getNodeParameter('documentName', itemIndex) as string;
						response = await frappeGetDoc.call(this, docType, documentName, apiVersion);
					} else if (operation === 'getMany') {
						const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
						const limit = returnAll ? 1000 : (this.getNodeParameter('limit', itemIndex) as number);
						const fieldsParameter = this.getNodeParameter('fields', itemIndex, '') as string;
						const fields = fieldsParameter.startsWith('[')
							? (JSON.parse(fieldsParameter) as string[])
							: prepareFields(fieldsParameter);
						const filters = prepareFilters(this.getNodeParameter('filtersJson', itemIndex, '[]'));
						const orderBy = this.getNodeParameter('orderBy', itemIndex, '') as string;

						if (!returnAll) {
							response = await frappeGetManyDocs.call(this, docType, {
								apiVersion,
								fields,
								filters,
								limitPageLength: limit,
								orderBy,
							});
						} else {
							const allDocs: IDataObject[] = [];
							let limitStart = 0;
							let hasMore = true;
							while (hasMore) {
								const page = await frappeGetManyDocs.call(this, docType, {
									apiVersion,
									fields,
									filters,
									limitStart,
									limitPageLength: limit,
									orderBy,
								});
								allDocs.push(...page);
								if (page.length < limit) {
									hasMore = false;
								} else {
									limitStart += limit;
								}
							}
							response = allDocs;
						}
					} else if (operation === 'create') {
						const data = prepareData(this.getNodeParameter('dataJson', itemIndex));
						response = await frappeCreateDoc.call(this, docType, data, apiVersion);
					} else if (operation === 'update') {
						const documentName = this.getNodeParameter('documentName', itemIndex) as string;
						const data = prepareData(this.getNodeParameter('dataJson', itemIndex));
						response = await frappeUpdateDoc.call(this, docType, documentName, data, apiVersion);
					} else if (operation === 'delete') {
						const documentName = this.getNodeParameter('documentName', itemIndex) as string;
						response = await frappeDeleteDoc.call(this, docType, documentName, apiVersion);
					} else if (operation === 'submit' || operation === 'cancel') {
						const documentName = this.getNodeParameter('documentName', itemIndex) as string;
						const doc = await frappeGetDoc.call(this, docType, documentName, apiVersion);
						response = await frappeRunDocAction.call(this, operation, doc);
					} else {
						throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}".`, {
							itemIndex,
						});
					}
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(response),
					{ itemData: { item: itemIndex } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: {
							item: itemIndex,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
