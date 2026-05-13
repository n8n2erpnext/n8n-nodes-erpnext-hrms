# n8n-nodes-erpnext-hrms

Community n8n node package for ERPNext/Frappe HRMS v15-v16.

This is the first package in the `n8n2erpnext` ecosystem. It focuses on HRMS doctypes and keeps a generic Frappe escape hatch for custom doctypes and whitelisted methods.

## Supported Resources

- Employee
- Attendance
- Employee Checkin
- Leave Application
- Leave Allocation
- Expense Claim
- Salary Slip
- Shift Assignment
- Holiday List
- Custom DocType
- Frappe Method

## Operations

For HRMS doctypes:

- Create
- Get
- Get Many
- Update
- Delete
- Submit
- Cancel

For Frappe methods:

- Run Method

## Credentials

Create an API key and secret in ERPNext/Frappe, then configure:

- Site URL: `https://erp.example.com`
- Site Host Header, optional: `erp.example.com`
- API Key
- API Secret
- Ignore SSL Issues, optional

The node authenticates with:

```http
Authorization: token api_key:api_secret
```

When n8n and ERPNext run on the same VPS, you can point n8n at the internal ERPNext address and still send the public ERPNext host header:

- Site URL: `http://10.192.135.2:8001`
- Site Host Header: `erp.thaiduy.digital`

This avoids public reverse-proxy authentication while still letting ERPNext receive the expected site host.

## Examples

Get active employees:

```json
{
  "resource": "employee",
  "operation": "getMany",
  "fields": "name,employee_name,status,company,department",
  "filtersJson": "[[\"status\",\"=\",\"Active\"]]",
  "returnAll": true
}
```

Create an employee checkin:

```json
{
  "resource": "employeeCheckin",
  "operation": "create",
  "dataJson": {
    "employee": "HR-EMP-0001",
    "time": "2026-05-13 08:30:00",
    "log_type": "IN"
  }
}
```

Run a whitelisted Frappe method:

```json
{
  "resource": "frappeMethod",
  "operation": "runMethod",
  "methodName": "frappe.client.get_value",
  "argumentsJson": {
    "doctype": "Employee",
    "filters": { "user_id": "person@example.com" },
    "fieldname": ["name", "employee_name"]
  }
}
```

## Webhook From n8n to ERPNext HRMS

Use this pattern when you want an HTTP GET endpoint in n8n that returns HRMS data from ERPNext.

### 1. Configure the ERPNext Credential

In n8n, create or edit an `ERPNext API` credential:

- Site URL: `http://10.192.135.2:8001`
- Site Host Header: `erp.thaiduy.digital`
- API Key: your ERPNext API key
- API Secret: your ERPNext API secret
- Ignore SSL Issues: `false`

If your ERPNext site is directly reachable without an internal proxy, use the public URL instead:

```text
https://erp.example.com
```

### 2. Create the Workflow

Create a workflow with these nodes:

```text
GET Webhook -> ERPNext HRMS
```

Webhook node:

- HTTP Method: `GET`
- Path: `erpnext-hrms-get-employees`
- Respond: `When Last Node Finishes`
- Response Data: `All Entries`

ERPNext HRMS node:

- Credential: your `ERPNext API` credential
- Resource: `Employee`
- Operation: `Get Many`
- API Version: `v1`
- Fields: `name,employee_name,status,company,department`
- Filters JSON: `[["status","=","Active"]]`
- Return All: `false`
- Limit: `10`
- Order By: `modified desc`

### 3. Activate and Test

Activate the workflow, then call:

```bash
curl -i https://n8n.example.com/webhook/erpnext-hrms-get-employees
```

On the local VPS, you can test without going through the public proxy:

```bash
curl -i http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
```

Example response:

```json
[
  {
    "name": "HR-EMP-00001",
    "employee_name": "Tèo Văn Nguyễn",
    "status": "Active",
    "company": "Thái Duy Digital",
    "department": "Human Resources - TDD"
  }
]
```

If the response is `[]`, the workflow is working but ERPNext has no matching active Employee records.

### Reverse Proxy Notes

If `https://erp.thaiduy.digital` is protected by NetBird or another reverse-proxy auth layer, n8n server-side requests may be blocked before they reach ERPNext. In that case:

- Use the internal ERPNext URL in `Site URL`.
- Set `Site Host Header` to the public ERPNext host.
- Keep the API key and secret from the ERPNext user that has permission to read/write the target DocType.

## Development

```bash
npm install
npm run build
```

For local n8n testing, link this package into your n8n custom nodes directory or install it from a packed tarball.

## Scope

This package is intentionally HRMS-focused. Other ERPNext modules should live in separate packages so each module can evolve independently:

- `n8n-nodes-erpnext-accounting`
- `n8n-nodes-erpnext-selling`
- `n8n-nodes-erpnext-buying`
- `n8n-nodes-erpnext-stock`

## License

MIT
