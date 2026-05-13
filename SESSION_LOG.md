# Session Log

## 2026-05-13

### Context

- Project: `n8n-nodes-erpnext-hrms`
- User reports n8n node points to ERPNext production at `erp.thaiduy.digital`.
- ERPNext production is deployed inside LXD on this VPS.
- n8n credential uses ERPNext admin API key and API secret.
- Current failing error from n8n:

```text
write EPROTO A0A395AABCEE0000:error:0A000438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error:../../deps/openssl/openssl/ssl/record/rec_layer_s3.c:918:SSL alert number 80
```

### Previous Work

- Read package structure: one credential, one ERPNext HRMS node, generic Frappe REST helpers.
- `npm run build` passed.
- `npm run lint` passed.
- `npm pack --dry-run` passed.
- Found production install/runtime issue: package could not require `n8n-workflow` after install in n8n container because `n8n-workflow` was only in `devDependencies` with optional peer metadata.
- Updated `package.json` and `package-lock.json` so `n8n-workflow` is a runtime `dependencies` entry.
- Rebuilt and repacked.
- Verified tarball installs into `/tmp` with `--omit=dev` and can require:
  - `ERPNext HRMS 14`
  - `ERPNext API 4`

### Current Goal

- Diagnose TLS/auth failure between n8n and `https://erp.thaiduy.digital`.
- Check from host VPS, from inside n8n container, and from the LXD/ERPNext side.
- Keep this file updated so another session can continue.

### Findings

- Host VPS to `https://erp.thaiduy.digital/api/method/frappe.auth.get_logged_user`:
  - TLS handshake OK.
  - Certificate OK: Let's Encrypt, CN/SAN `erp.thaiduy.digital`.
  - Public response without auth: plain `HTTP/2 403 Forbidden`.
- Node.js inside the `n8n` Docker container to the same public URL:
  - No TLS failure in a minimal Node HTTPS request.
  - Response is also plain `403 Forbidden`.
  - Node version in container: `v24.14.1`, OpenSSL `3.5.5`.
- LXD container:
  - Name: `lxd-arm`.
  - IP: `10.192.135.2`.
  - nginx listens on `0.0.0.0:8001`.
  - gunicorn listens on `127.0.0.1:8000`.
- Direct request to ERPNext nginx in LXD:
  - `http://10.192.135.2:8001/api/method/frappe.auth.get_logged_user`
  - Returns Frappe JSON, not plain proxy `Forbidden`.
  - Without auth it returns Frappe permission JSON.
  - With fake `Authorization: token invalid:invalid` it returns Frappe `401 AuthenticationError`.
- NetBird proxy logs show public requests from this VPS/n8n source IP are blocked before backend:
  - `host=erp.thaiduy.digital`
  - `status=403`
  - `origin=auth`
  - `IP restriction: country_restricted for 138.2.99.208`
- Conclusion so far:
  - `erp.thaiduy.digital` is protected by NetBird proxy/auth/IP restriction.
  - Browser access from an authenticated client can reach backend.
  - n8n running on the VPS is treated as source `138.2.99.208` and is blocked before ERPNext sees the API key.
  - The public URL is therefore not a reliable Site URL for server-side n8n API calls unless NetBird proxy auth/IP policy is changed.

### Recommended Next Test

- In n8n credential, use internal ERPNext URL:

```text
http://10.192.135.2:8001
```

- Keep the same ERPNext API Key and API Secret.
- This should bypass NetBird public auth and send requests directly from n8n to ERPNext nginx inside LXD.
- If ERPNext multi-site host validation becomes an issue, use the new credential field below.

### Code Changes In This Session

- Added optional credential field `siteHost` / display name `Site Host Header`.
- Runtime requests now send `Host: <siteHost>` when `siteHost` is configured.
- Credential test request also sends a Host header derived from `siteHost` when set, otherwise from `siteUrl`.
- This supports a setup like:

```text
Site URL: http://10.192.135.2:8001
Site Host Header: erp.thaiduy.digital
```

### Verification

- `npm run build` passed.
- `npm run lint` passed.
- `npm pack` succeeded.
- Production install test from tarball with `--omit=dev` succeeded.
- The installed package loads and credential properties include:
  - `siteUrl`
  - `siteHost`
  - `apiKey`
  - `apiSecret`
  - `allowUnauthorizedCerts`

### Still To Apply On Live n8n

- The updated tarball has been created in the repo:

```text
n8n-nodes-erpnext-hrms-0.1.0.tgz
```

- It has not yet been installed into the live `n8n` container and the container has not been restarted in this session.
- After installing the updated package in n8n, configure credential:

```text
Site URL: http://10.192.135.2:8001
Site Host Header: erp.thaiduy.digital
API Key: <ERPNext admin API key>
API Secret: <ERPNext admin API secret>
Ignore SSL Issues: false
```

### 2026-05-13 Webhook Test Workflow

- Installed the updated local tarball into the live `n8n` container:

```text
/home/node/.n8n/nodes
```

- Verified the installed package can now load inside the `n8n` container:

```text
loaded ErpNextApi,ErpNextHrms
siteUrl,siteHost,apiKey,apiSecret,allowUnauthorizedCerts
```

- Restarted `n8n` so the updated community node is loaded.
- Found existing ERPNext credential:

```text
Credential name: ERPNext account
Credential id: 9hFY985G0WpX5Xyt
Credential type: erpNextApi
```

- Created workflow artifact in this repo:

```text
n8n-webhook-erpnext-hrms-get-employees.workflow.json
```

- Imported/published/activated the workflow in n8n:

```text
Workflow name: ERPNext HRMS GET Employees Webhook
Workflow id: cY31OLkUamjHrm01
Webhook path: erpnext-hrms-get-employees
Local test URL: http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
Public URL: https://n8n.thaiduy.store/webhook/erpnext-hrms-get-employees
```

- Workflow shape:

```text
GET Webhook -> Get Active Employees
```

- The Webhook node uses HTTP `GET`, waits for the last node, and returns all entries as JSON.
- The ERPNext HRMS node uses:

```text
Resource: Employee
Operation: Get Many
API Version: v1
Fields: name,employee_name,status,company,department
Filters JSON: [["status","=","Active"]]
Limit: 10
Order By: modified desc
Credential: ERPNext account
```

- Tested the webhook locally:

```text
curl -i --connect-timeout 20 http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
```

- Result:

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[]
```

- Checked ERPNext database counts:

```text
Employee: 0
Attendance: 0
Employee Checkin: 0
Leave Application: 0
Holiday List: 0
User: 3
```

- The empty JSON array is expected because there are currently no Employee records in ERPNext production.

### 2026-05-13 Retest After Adding Employee

- User added one Employee in ERPNext production.
- Reran the webhook:

```text
curl -i --connect-timeout 20 http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
```

- Result:

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

- Confirmed directly in ERPNext DB:

```text
name           employee_name      status  company            department
HR-EMP-00001   Tèo Văn Nguyễn     Active  Thái Duy Digital   Human Resources - TDD
```

- n8n execution:

```text
Execution id: 3106
Workflow id: cY31OLkUamjHrm01
Status: success
Mode: webhook
Started: 2026-05-13 06:07:37.612+00
Stopped: 2026-05-13 06:07:37.668+00
```

- n8n log still shows unrelated reverse-proxy warning:

```text
ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
```

- This warning is about n8n trust proxy / Express rate limit config and did not block the local webhook test.

### 2026-05-13 README Webhook Guide

- Added README documentation for creating a n8n GET webhook connected to the ERPNext HRMS node.
- Updated credential docs to mention:
  - `Site URL`
  - optional `Site Host Header`
  - API key and API secret
- Documented the working VPS/LXD setup:

```text
Site URL: http://10.192.135.2:8001
Site Host Header: erp.thaiduy.digital
```

- Documented workflow shape:

```text
GET Webhook -> ERPNext HRMS
```

- Documented the tested webhook path:

```text
/webhook/erpnext-hrms-get-employees
```
