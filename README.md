# n8n-nodes-erpnext-hrms

Community n8n node package for ERPNext/Frappe HRMS v15-v16.

This is the first package in the `n8n2erpnext` ecosystem. It focuses on HRMS doctypes and keeps a generic Frappe escape hatch for custom doctypes and whitelisted methods.

## Who This Is For

This package is built for SME and mid-market teams that run ERPNext HRMS and want a controlled way to connect HR data with n8n workflows.

Typical users:

- IT ERP administrators who maintain ERPNext/Frappe.
- HRIS or operations teams that need employee, attendance, leave, payroll, or shift workflows.
- Integration teams that need repeatable n8n automations without writing custom Frappe client code for every workflow.

The node is intentionally conservative: it exposes standard HRMS document operations, supports Frappe API v1 and v2, and allows controlled fallback access to custom DocTypes and whitelisted Frappe methods.

## Architecture At A Glance

Read workflow from left to right:

```text
ERPNext / Frappe HRMS  <---- API token ---->  n8n ERPNext HRMS node  <---- webhook/API ---->  Client / App / Report
```

Common read pattern:

```text
Client
  -> n8n Webhook
  -> ERPNext HRMS node
  -> Frappe REST API
  -> ERPNext HRMS DocType
  -> filtered JSON response
```

Common ERPNext event pattern:

```text
ERPNext Webhook
  -> n8n Webhook Trigger
  -> validation / mapping / approval logic
  -> ERPNext HRMS node or downstream systems
```

Recommended production network pattern:

```text
Public Client
  -> HTTPS reverse proxy / VPN / allowlist
  -> n8n
  -> private network or internal VPS address
  -> ERPNext / Frappe site
```

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

## Node Identity

All `n8n2erpnext` module nodes use the same ERPNext-style logo shape. Each module changes only the main background color.

| Module | Color | Hex | Reason |
| --- | --- | --- | --- |
| Core | ERPNext blue | `#2490EF` | Foundation package, closest to the ERPNext brand color. |
| HRMS | People green | `#2E7D5F` | Human operations, employees, attendance, leave, payroll. |
| Accounting | Finance orange-red | `#D94A2B` | Ledger, journals, invoices, financial control. |
| Buying | Procurement amber | `#C47F00` | Purchase flow, suppliers, RFQs, purchase orders, spend. |
| Selling | Commerce teal | `#00A6A6` | Customer-facing pipeline, quotations, sales orders, revenue. |
| Stock | Frappe black | `#171717` | Warehouses, items, inventory movement; aligned with Frappe black. |

When building another module, copy the HRMS/Accounting SVG structure and change only the main background fill to that module color.

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

## API Versions

The node supports both ERPNext/Frappe document API styles:

- `v1`: `/api/resource/:doctype`
- `v2`: `/api/v2/document/:doctype`

Use `v1` for broad compatibility. Use `v2` when your ERPNext/Frappe v16 environment is ready for the newer document API behavior.

Reference:

- [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest)

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

### Internal URL With Public Host Header

When n8n and ERPNext run on the same VPS, you can point n8n at the internal ERPNext address and still send the public ERPNext host header:

- Site URL: `http://erpnext.internal:8001`
- Site Host Header: `erp.example.com`

This avoids public reverse-proxy authentication while still letting ERPNext receive the expected site host.

For production, create a dedicated ERPNext integration user instead of using a daily admin account. Give that user only the roles required for the workflows it runs.

Official Frappe references:

- [Frappe REST API authentication](https://docs.frappe.io/framework/user/en/api/rest)
- [Frappe token based authentication](https://docs.frappe.io/framework/v15/user/en/guides/integration/rest_api/token_based_authentication)
- [Generate Frappe API key and secret](https://docs.frappe.io/framework/v15/user/en/guides/integration/how_to_setup_token_based_auth)

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

```text
Client / Browser / BI Tool
  -> GET n8n webhook URL
  -> ERPNext HRMS node
  -> GET /api/resource or /api/v2/document
  -> JSON response
```

### 1. Configure the ERPNext Credential

In n8n, create or edit an `ERPNext API` credential:

- Site URL: `http://erpnext.internal:8001`
- Site Host Header: `erp.example.com`
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
    "employee_name": "Jane Doe",
    "status": "Active",
    "company": "Example Company",
    "department": "Human Resources - EX"
  }
]
```

If the response is `[]`, the workflow is working but ERPNext has no matching active Employee records.

## Webhook From ERPNext v16 to n8n

Use this pattern when ERPNext should call n8n automatically after an HRMS document is created or updated. For example, ERPNext can call a n8n workflow whenever an `Employee` record is saved.

```text
ERPNext Doc Event
  -> Frappe Webhook
  -> POST n8n webhook URL
  -> n8n workflow
  -> validation, notification, sync, approval, or downstream automation
```

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
http://n8n.internal:5678/webhook/erpnext-employee-event
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

Official Frappe reference:

- [Frappe Webhooks](https://docs.frappe.io/framework/user/en/guides/integration/webhooks)

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
  "employee_name": "Jane Doe",
  "status": "Active",
  "company": "Example Company",
  "department": "Human Resources - EX",
  "modified": "2026-05-13 13:07:37.000000"
}
```

### 5. Common Issues

- If ERPNext cannot reach the n8n URL, test from the ERPNext/LXD container with `curl`.
- If the n8n public URL is protected by NetBird or another auth proxy, either allow ERPNext through that proxy or use an internal URL.
- If n8n logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, configure n8n trust proxy for your reverse proxy setup.
- If the workflow does not run, make sure the n8n workflow is active and you are using the production `/webhook/` URL, not the test `/webhook-test/` URL.

## Reverse Proxy Notes

If `https://erp.example.com` is protected by NetBird or another reverse-proxy auth layer, n8n server-side requests may be blocked before they reach ERPNext. In that case:

- Use the internal ERPNext URL in `Site URL`.
- Set `Site Host Header` to the public ERPNext host.
- Keep the API key and secret from the ERPNext user that has permission to read/write the target DocType.

## Security Baseline

HRMS data usually includes personal, attendance, leave, payroll, and identity-related records. Treat every workflow as sensitive by default.

Recommended baseline:

- Use a dedicated ERPNext API user for n8n integrations.
- Avoid using a full Administrator API key in production.
- Scope ERPNext roles to the exact DocTypes and actions needed by the workflow.
- Prefer `Get Many` with explicit `Fields` over `Get` when exposing webhook responses, because `Get` can return the full document including sensitive fields.
- Keep n8n webhook URLs private unless they are meant to be public.
- Add authentication to public n8n webhooks, such as header auth, reverse proxy auth, VPN, IP allowlisting, or a shared secret.
- Do not log API keys, API secrets, employee identity fields, salary data, or raw webhook payloads into external systems unless there is a clear retention policy.
- Use HTTPS for public traffic.
- If n8n and ERPNext are on the same VPS or private network, prefer the internal ERPNext URL plus `Site Host Header`.
- Rotate API keys after testing, after staff changes, and after any suspected exposure.
- Review n8n execution data retention. Disable or reduce saved execution data for workflows that process payroll, salary slips, or personally identifiable information.

## Security Notice

Security notice: form-data vulnerability is acknowledged but mitigated by infrastructure/scoped API access.

The current dependency tree can report a transitive `form-data` advisory through `n8n-workflow`. In this package's tested deployment model, risk is reduced by:

- Internal network access between n8n and ERPNext.
- Reverse proxy or VPN controls for public endpoints.
- Dedicated ERPNext API credentials with scoped roles.
- Explicit field selection for public webhook responses.
- Avoiding public exposure of generic Custom DocType and Frappe Method workflows.

Do not treat this mitigation as a permanent substitute for dependency maintenance. Re-run `npm audit --omit=dev` before publishing a new package version and upgrade compatible n8n dependencies when the upstream dependency chain allows it without breaking n8n node compatibility.

## Deployment Checklist For SME And Mid-Market Teams

Before going live:

- Confirm ERPNext/Frappe version and choose API `v1` or `v2`.
- Create a dedicated ERPNext integration user.
- Assign only the required HRMS roles and permissions.
- Configure n8n credentials with the ERPNext internal URL when available.
- Set `Site Host Header` if ERPNext is served by a named Frappe site.
- Build and install the packed node package into the n8n custom nodes environment.
- Test `Get Many` for each required resource with limited fields.
- Test write operations in a staging site before production.
- Review n8n execution data retention and error logging.
- Protect public webhooks with authentication or network controls.
- Keep workflow JSON exports out of public repositories if they contain real URLs, headers, filters, or business logic.

Suggested production approach:

- Start with read-only HRMS reporting workflows.
- Add write workflows only after role permissions and audit logs are reviewed.
- Keep Custom DocType and Frappe Method workflows limited to trusted internal operators.
- Document each production workflow owner, purpose, data fields, and rollback path.

## Troubleshooting

Common checks:

- `401` or `403`: verify API key, API secret, user roles, and DocType permissions in ERPNext.
- TLS `EPROTO` or `tlsv1 alert internal error`: use the internal ERPNext HTTP URL from n8n when the public domain is protected by a reverse proxy or VPN layer.
- Empty `[]` response: the node is working, but filters may not match any records.
- Frappe site not found or wrong site: set `Site Host Header` to the public ERPNext site name.
- n8n webhook does not run: activate the workflow and use the production `/webhook/` URL, not `/webhook-test/`.
- Unexpected sensitive fields in output: switch from `Get` to `Get Many` and set an explicit `Fields` list.

## Development

```bash
npm install
npm run build
```

For local n8n testing, link this package into your n8n custom nodes directory or install it from a packed tarball.

Useful n8n references:

- [n8n community nodes installation](https://docs.n8n.io/integrations/community-nodes/installation/)
- [Install community nodes from the n8n GUI](https://docs.n8n.io/integrations/community-nodes/installation/gui-install/)
- [Manual community node installation](https://docs.n8n.io/integrations/community-nodes/installation/manual-install/)
- [Using community nodes](https://docs.n8n.io/integrations/community-nodes/usage/)
- [Creating n8n nodes](https://docs.n8n.io/integrations/creating-nodes/)
- [Using the n8n-node tool](https://docs.n8n.io/integrations/creating-nodes/build/n8n-node/)
- [n8n node linter](https://docs.n8n.io/integrations/creating-nodes/test/node-linter/)
- [Submit community nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/)

## Scope And Roadmap

This package is intentionally HRMS-focused. Other ERPNext modules should live in separate packages so each module can evolve independently:

- `n8n-nodes-erpnext-accounting`
- `n8n-nodes-erpnext-selling`
- `n8n-nodes-erpnext-buying`
- `n8n-nodes-erpnext-stock`

Recommended next hardening tasks before wider public adoption:

- Add automated unit tests for request construction and API v1/v2 endpoint behavior.
- Add credential redaction checks around error messages.
- Add sample workflows that use limited fields by default.
- Add a production security checklist to release notes for every package version.

## Official References

Frappe / ERPNext:

- [ERPNext introduction](https://docs.frappe.io/erpnext)
- [Frappe HR overview](https://docs.frappe.io/erpnext/user/manual/en/human-resources)
- [Employee](https://docs.frappe.io/erpnext/user/manual/en/employee)
- [Attendance](https://docs.frappe.io/erpnext/user/manual/en/attendance)
- [Leave Application](https://docs.frappe.io/erpnext/user/manual/en/leave-application)
- [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest)
- [Frappe token based authentication](https://docs.frappe.io/framework/v15/user/en/guides/integration/rest_api/token_based_authentication)
- [Generate Frappe API key and secret](https://docs.frappe.io/framework/v15/user/en/guides/integration/how_to_setup_token_based_auth)
- [Frappe Webhooks](https://docs.frappe.io/framework/user/en/guides/integration/webhooks)

n8n:

- [n8n integrations and nodes overview](https://docs.n8n.io/integrations/)
- [n8n community nodes installation](https://docs.n8n.io/integrations/community-nodes/installation/)
- [Manual community node installation](https://docs.n8n.io/integrations/community-nodes/installation/manual-install/)
- [Using community nodes](https://docs.n8n.io/integrations/community-nodes/usage/)
- [Creating n8n nodes](https://docs.n8n.io/integrations/creating-nodes/)
- [Submit community nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/)

## License

MIT

## Acknowledgement

Prepared and reviewed with care by Codex for the `n8n2erpnext` ERPNext HRMS integration work.

Signed: Codex, May 13, 2026.
