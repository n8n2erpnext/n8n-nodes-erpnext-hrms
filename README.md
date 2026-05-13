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

For Frappe/ERPNext v16 API v2, use the same workflow and set:

```text
API Version: v2
```

The node will call the v2 document endpoint:

```text
/api/v2/document/Employee
```

Example v2 test endpoint:

```bash
curl -i http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employees
```

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

## Webhook From ERPNext v16 to n8n

Use this pattern when ERPNext should call n8n automatically after an HRMS document is created or updated. For example, ERPNext can call a n8n workflow whenever an `Employee` record is saved.

### 1. Create the n8n Webhook Receiver

Create a workflow in n8n with a Webhook trigger:

```text
Webhook -> your processing nodes
```

Webhook node:

- HTTP Method: `POST`
- Path: `erpnext-employee-event`
- Authentication: `None` for a private/internal test, or `Header Auth` for production
- Respond: `Immediately` or `When Last Node Finishes`

The production webhook URL will look like:

```text
https://n8n.example.com/webhook/erpnext-employee-event
```

On this VPS, if ERPNext and n8n are on the same host/network, you can also use the internal n8n URL from ERPNext:

```text
http://100.94.184.141:5678/webhook/erpnext-employee-event
```

Use the public URL if ERPNext cannot reach the internal n8n address.

### 2. Add the Webhook in ERPNext/Frappe v16

In ERPNext/Frappe Desk:

1. Open the global search bar.
2. Search for `Webhook`.
3. Open `Webhook` from the Integrations area.
4. Click `New`.

Configure the Webhook:

- Enabled: checked
- Webhook Doctype: `Employee`
- Doc Event: `on_update` for every save, or `after_insert` for newly created employees only
- Request URL: your n8n production webhook URL
- Request Method: `POST`
- Request Structure: `JSON`
- Webhook JSON: use the example below

Example JSON body:

```json
{
  "event": "employee_updated",
  "doctype": "{{ doc.doctype }}",
  "name": "{{ doc.name }}",
  "employee_name": "{{ doc.employee_name }}",
  "status": "{{ doc.status }}",
  "company": "{{ doc.company }}",
  "department": "{{ doc.department }}",
  "modified": "{{ doc.modified }}"
}
```

For a newly created Employee only, set:

```text
Doc Event: after_insert
```

For every save/update, set:

```text
Doc Event: on_update
```

### 3. Add Headers

For a simple JSON webhook, add this header:

```text
Content-Type: application/json
```

For production, add a shared secret header and validate it in n8n:

```text
X-ERPNext-Webhook-Secret: your-long-random-secret
```

If you use Frappe's Webhook Secret field, Frappe adds an `X-Frappe-Webhook-Signature` header generated from the payload and secret. You can verify this signature in n8n with a Code node if needed.

### 4. Test the ERPNext Webhook

1. Activate the n8n workflow.
2. In ERPNext, create or edit an Employee.
3. Save the Employee.
4. Open n8n executions and check the latest webhook execution.

The n8n Webhook node should receive a body similar to:

```json
{
  "event": "employee_updated",
  "doctype": "Employee",
  "name": "HR-EMP-00001",
  "employee_name": "Tèo Văn Nguyễn",
  "status": "Active",
  "company": "Thái Duy Digital",
  "department": "Human Resources - TDD",
  "modified": "2026-05-13 13:07:37.000000"
}
```

### 5. Common Issues

- If ERPNext cannot reach the n8n URL, test from the ERPNext/LXD container with `curl`.
- If the n8n public URL is protected by NetBird or another auth proxy, either allow ERPNext through that proxy or use an internal URL.
- If n8n logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, configure n8n trust proxy for your reverse proxy setup.
- If the workflow does not run, make sure the n8n workflow is active and you are using the production `/webhook/` URL, not the test `/webhook-test/` URL.

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
