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
- API Key
- API Secret
- Ignore SSL Issues, optional

The node authenticates with:

```http
Authorization: token api_key:api_secret
```

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
