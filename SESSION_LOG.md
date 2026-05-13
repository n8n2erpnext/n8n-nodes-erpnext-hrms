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

### 2026-05-13 README ERPNext v16 Webhook Guide

- Added README documentation for creating a Webhook directly in ERPNext/Frappe v16.
- Documented the direction:

```text
ERPNext Employee event -> n8n Webhook
```

- Documented n8n receiver setup:

```text
HTTP Method: POST
Path: erpnext-employee-event
Production URL: /webhook/erpnext-employee-event
```

- Documented ERPNext Webhook setup from Desk:
  - Search `Webhook`
  - Create a new Webhook
  - Webhook Doctype: `Employee`
  - Doc Event: `on_update` or `after_insert`
  - Request Method: `POST`
  - Request Structure: `JSON`
  - JSON body using Jinja values from `doc`
- Documented headers/security notes:
  - `Content-Type: application/json`
  - optional custom shared secret header
  - optional Frappe `X-Frappe-Webhook-Signature`

### 2026-05-13 API v2 Test

- User requested testing the node with ERPNext/Frappe v16 API v2.
- Created workflow artifact:

```text
n8n-webhook-erpnext-hrms-v2-get-employees.workflow.json
```

- Imported/published/activated the workflow in n8n:

```text
Workflow name: ERPNext HRMS V2 GET Employees Webhook
Workflow id: cY31OLkUamjHrm02
Webhook path: erpnext-hrms-v2-get-employees
Local test URL: http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employees
```

- Workflow shape:

```text
GET Webhook -> Get Active Employees V2
```

- ERPNext HRMS node parameters:

```text
Resource: Employee
Operation: Get Many
API Version: v2
Fields: name,employee_name,status,company,department
Filters JSON: [["status","=","Active"]]
Limit: 10
Order By: modified desc
Credential: ERPNext account
```

- Restarted n8n so the production webhook was registered.
- Tested:

```text
curl -i --connect-timeout 20 http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employees
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

- n8n execution:

```text
Execution id: 3107
Workflow id: cY31OLkUamjHrm02
Status: success
Mode: webhook
Started: 2026-05-13 06:19:44.387+00
Stopped: 2026-05-13 06:19:44.456+00
```

- Conclusion: API v2 `getMany` for Employee works against the ERPNext/Frappe v16 production site through this node.

## Project Handover For A Fresh AI Session

This section is intentionally detailed. A new AI model should be able to read only this file and understand what the project is, how it is coded, how it is deployed into n8n, and which workflows are currently running.

### What This Repository Is

This repository is an n8n community node package named:

```text
n8n-nodes-erpnext-hrms
```

Its purpose is to expose ERPNext/Frappe HRMS v15-v16 operations inside n8n. It is scoped to HRMS resources and keeps two escape hatches:

- `Custom DocType` for arbitrary Frappe document doctypes.
- `Frappe Method` for whitelisted method calls.

The package is not an n8n workflow project by itself. It is a Node.js/TypeScript package that n8n installs as a community node. It also currently contains two workflow JSON artifacts that were created during live testing.

### Important Files

```text
package.json
package-lock.json
tsconfig.json
gulpfile.js
index.ts
credentials/ErpNextApi.credentials.ts
nodes/ErpNextHrms/ErpNextHrms.node.ts
nodes/ErpNextHrms/GenericFunctions.ts
credentials/erpnext.svg
nodes/ErpNextHrms/erpnext-hrms.svg
README.md
SESSION_LOG.md
n8n-webhook-erpnext-hrms-get-employees.workflow.json
n8n-webhook-erpnext-hrms-v2-get-employees.workflow.json
n8n-nodes-erpnext-hrms-0.1.0.tgz
dist/
```

What each file does:

- `package.json`: npm metadata, n8n package metadata, scripts, dependencies.
- `package-lock.json`: locked dependency tree.
- `tsconfig.json`: TypeScript compiles source to CommonJS under `dist/`, emits declarations and sourcemaps.
- `gulpfile.js`: copies SVG icons from source folders into `dist/`.
- `index.ts`: exports the credential class and node class.
- `credentials/ErpNextApi.credentials.ts`: defines the n8n credential type `erpNextApi`.
- `nodes/ErpNextHrms/ErpNextHrms.node.ts`: defines the n8n node UI and execution logic.
- `nodes/ErpNextHrms/GenericFunctions.ts`: all low-level Frappe/ERPNext HTTP helper functions.
- `README.md`: user/developer guide, including n8n webhook patterns and ERPNext webhook setup.
- `SESSION_LOG.md`: this operational log and handover file.
- `n8n-webhook-erpnext-hrms-get-employees.workflow.json`: imported workflow artifact for API v1 Employee getMany testing.
- `n8n-webhook-erpnext-hrms-v2-get-employees.workflow.json`: imported workflow artifact for API v2 Employee getMany testing.
- `n8n-nodes-erpnext-hrms-0.1.0.tgz`: packed tarball installed into the live n8n container during testing.
- `dist/`: generated build output. n8n loads from this folder, not directly from TypeScript source.

### Package Metadata And Build

`package.json` currently has:

```text
name: n8n-nodes-erpnext-hrms
version: 0.1.0
main: dist/index.js
```

The n8n metadata is:

```json
{
  "n8nNodesApiVersion": 1,
  "credentials": [
    "dist/credentials/ErpNextApi.credentials.js"
  ],
  "nodes": [
    "dist/nodes/ErpNextHrms/ErpNextHrms.node.js"
  ]
}
```

Scripts:

```text
npm run build       -> tsc && gulp build:icons
npm run lint        -> eslint credentials nodes --ext .ts
npm pack            -> creates n8n-nodes-erpnext-hrms-0.1.0.tgz
npm run dev         -> TypeScript watch mode
```

Important dependency decision:

- `n8n-workflow` is in `dependencies`, not only `devDependencies`.
- This was changed because the live n8n container failed to require the package with `Cannot find module 'n8n-workflow'` when the tarball was installed in production mode.
- After moving `n8n-workflow` to runtime dependencies, a production install test with `--omit=dev` succeeded.

Build command that has passed:

```bash
npm run build
```

Lint command that has passed:

```bash
npm run lint
```

Production install test that has passed:

```bash
tmp=$(mktemp -d /tmp/erpnext-hrms-test-XXXXXX)
npm install --prefix "$tmp" /home/ubuntu/n8n2erpnext/n8n-nodes-erpnext-hrms/n8n-nodes-erpnext-hrms-0.1.0.tgz --omit=dev
node -e "const pkg=require(process.argv[1] + '/node_modules/n8n-nodes-erpnext-hrms'); const node=new pkg.ErpNextHrms(); const cred=new pkg.ErpNextApi(); console.log(node.description.displayName, node.description.properties.length); console.log(cred.displayName, cred.properties.map(p=>p.name).join(','));" "$tmp"
```

Expected output includes:

```text
ERPNext HRMS 14
ERPNext API siteUrl,siteHost,apiKey,apiSecret,allowUnauthorizedCerts
```

### Credential Implementation

Credential class:

```text
credentials/ErpNextApi.credentials.ts
Class: ErpNextApi
n8n credential type name: erpNextApi
displayName: ERPNext API
```

Credential fields:

```text
siteUrl                 required string
siteHost                optional string
apiKey                  required password string
apiSecret               required password string
allowUnauthorizedCerts  boolean
```

`siteUrl` is the base URL n8n will actually connect to. In the live VPS setup this is usually:

```text
http://10.192.135.2:8001
```

`siteHost` is optional and becomes the HTTP `Host` header. It exists because n8n may connect to ERPNext through an internal IP while ERPNext still expects the public site host:

```text
erp.thaiduy.digital
```

Authentication is generic n8n HTTP header authentication:

```http
Authorization: token {{$credentials.apiKey}}:{{$credentials.apiSecret}}
```

Credential test request:

```text
GET /api/method/frappe.auth.get_logged_user
baseURL = siteUrl without trailing slash
Host = siteHost if set, otherwise the host parsed from siteUrl
```

Note: unauthenticated calls to `frappe.auth.get_logged_user` may return a Frappe permission error because it is not whitelisted for Guest. With a real API key/secret it should authenticate.

### Node Implementation

Node class:

```text
nodes/ErpNextHrms/ErpNextHrms.node.ts
Class: ErpNextHrms
n8n node type: n8n-nodes-erpnext-hrms.erpNextHrms
node name inside package: erpNextHrms
displayName: ERPNext HRMS
version: 1
group: transform
inputs: main
outputs: main
credential required: erpNextApi
```

Supported resources in the UI:

```text
Employee
Attendance
Employee Checkin
Expense Claim
Holiday List
Leave Allocation
Leave Application
Salary Slip
Shift Assignment
Custom DocType
Frappe Method
```

Resource-to-Frappe-DocType mapping in `getDocType()`:

```text
employee          -> Employee
attendance        -> Attendance
employeeCheckin   -> Employee Checkin
leaveApplication  -> Leave Application
leaveAllocation   -> Leave Allocation
expenseClaim      -> Expense Claim
salarySlip        -> Salary Slip
shiftAssignment   -> Shift Assignment
holidayList       -> Holiday List
```

`customDocType` bypasses that map and uses the user-entered DocType name.

Supported document operations:

```text
create
get
getMany
update
delete
submit
cancel
```

Supported Frappe method operation:

```text
runMethod
```

API version selector:

```text
v1 -> /api/resource
v2 -> /api/v2/document and /api/v2/method
```

Important node parameters:

```text
resource
apiVersion
operation
customDocType
documentName
dataJson
fields
filtersJson
returnAll
limit
orderBy
methodName
argumentsJson
```

Execution flow in `execute()`:

1. Read incoming n8n items with `this.getInputData()`.
2. For each input item:
   - Read `resource` and `operation`.
   - If `resource === frappeMethod`, read `apiVersion`, `methodName`, parse `argumentsJson`, call `frappeRunMethod()`.
   - Otherwise read `apiVersion`, optional `customDocType`, map `resource` to a Frappe DocType.
3. Dispatch based on operation:
   - `get`: call `frappeGetDoc()`.
   - `getMany`: parse `fields`, parse `filtersJson`, read `orderBy`, handle pagination if `returnAll` is true, call `frappeGetManyDocs()`.
   - `create`: parse `dataJson`, call `frappeCreateDoc()`.
   - `update`: parse `dataJson`, call `frappeUpdateDoc()`.
   - `delete`: call `frappeDeleteDoc()`.
   - `submit` or `cancel`: first fetch the document, then call `frappeRunDocAction()`.
4. Convert the response into n8n output with:

```text
this.helpers.returnJsonArray(response)
this.helpers.constructExecutionMetaData(..., { itemData: { item: itemIndex } })
```

5. If `continueOnFail()` is enabled, return an item with `{ error: ... }`; otherwise throw.

### HTTP Helper Implementation

Main helper file:

```text
nodes/ErpNextHrms/GenericFunctions.ts
```

Important helpers:

```text
normalizeSiteUrl(siteUrl)
parseJsonParameter(value, parameterName)
getDocType(resource, customDocType)
prepareFields(fields)
prepareData(dataJson)
prepareFilters(filtersJson)
frappeApiRequest(method, endpoint, body, qs)
frappeGetDoc(docType, name, apiVersion)
frappeGetManyDocs(docType, options)
frappeCreateDoc(docType, data, apiVersion)
frappeUpdateDoc(docType, name, data, apiVersion)
frappeDeleteDoc(docType, name, apiVersion)
frappeRunDocAction(action, doc)
frappeRunMethod(methodName, args, apiVersion)
```

`frappeApiRequest()`:

- Reads credential `erpNextApi`.
- Trims trailing slashes from `siteUrl`.
- Builds `IHttpRequestOptions`.
- Uses n8n `httpRequestWithAuthentication` so the credential's `Authorization` header is applied.
- Sends `Host: siteHost` if `siteHost` is configured.
- Sets `json: true`.
- Applies `skipSslCertificateValidation` from `allowUnauthorizedCerts`.
- Wraps errors as `NodeApiError`.

Endpoint rules:

```text
v1 document list/get/create: /api/resource/{encodedDocType}
v1 named document:          /api/resource/{encodedDocType}/{encodedName}
v2 document list/get/create: /api/v2/document/{encodedDocType}
v2 named document:          /api/v2/document/{encodedDocType}/{encodedName}/
v1 method:                  /api/method/{methodName}
v2 method:                  /api/v2/method/{methodName}
```

HTTP method differences:

```text
create: POST
get/getMany: GET
update v1: PUT
update v2: PATCH
delete: DELETE
```

List query parameter differences:

```text
v1 pagination:
  limit_start
  limit_page_length

v2 pagination:
  start
  limit
```

Shared list params:

```text
fields = JSON.stringify(fieldsArray)
filters = JSON.stringify(filtersObjectOrArray)
order_by = orderBy
```

`fields` behavior in the node:

- If the parameter starts with `[`, it is parsed with `JSON.parse`.
- Otherwise it is split by comma and trimmed.
- Example: `name,employee_name,status,company,department`.

`filtersJson` is parsed as JSON. Example:

```json
[["status", "=", "Active"]]
```

### Build Output And n8n Loading

n8n does not load TypeScript source. It loads JavaScript from `dist/` according to the `n8n` metadata in `package.json`.

Build creates:

```text
dist/index.js
dist/credentials/ErpNextApi.credentials.js
dist/nodes/ErpNextHrms/ErpNextHrms.node.js
dist/nodes/ErpNextHrms/GenericFunctions.js
dist/**/*.d.ts
dist/**/*.js.map
dist/credentials/erpnext.svg
dist/nodes/ErpNextHrms/erpnext-hrms.svg
```

Icon copying is done by `gulp build:icons`.

To make changes available to live n8n:

1. Edit TypeScript source.
2. Run:

```bash
npm run build
npm run lint
npm pack
```

3. Copy tarball into container:

```bash
docker cp /home/ubuntu/n8n2erpnext/n8n-nodes-erpnext-hrms/n8n-nodes-erpnext-hrms-0.1.0.tgz n8n:/tmp/n8n-nodes-erpnext-hrms-0.1.0.tgz
```

4. Install inside n8n custom nodes folder:

```bash
docker exec n8n sh -lc 'cd /home/node/.n8n/nodes && npm install /tmp/n8n-nodes-erpnext-hrms-0.1.0.tgz --omit=dev'
```

5. Verify require:

```bash
docker exec n8n sh -lc 'cd /home/node/.n8n/nodes && node -e "const pkg=require(\"n8n-nodes-erpnext-hrms\"); const c=new pkg.ErpNextApi(); console.log(\"loaded\", Object.keys(pkg).join(\",\")); console.log(c.properties.map(p=>p.name).join(\",\"));"'
```

Expected:

```text
loaded ErpNextApi,ErpNextHrms
siteUrl,siteHost,apiKey,apiSecret,allowUnauthorizedCerts
```

6. Restart n8n:

```bash
docker restart n8n
```

7. Check logs:

```bash
docker logs --since 1m n8n 2>&1 | tail -160
```

### Current Live Environment

Current workspace:

```text
/home/ubuntu/n8n2erpnext/n8n-nodes-erpnext-hrms
```

Host date/time context during this work:

```text
2026-05-13
Timezone: Asia/Ho_Chi_Minh
```

Docker containers relevant to this project:

```text
n8n              docker.n8n.io/n8nio/n8n:latest       port 5678
n8n-postgres-1   postgres:16-alpine                   n8n database
netbird-proxy    netbirdio/reverse-proxy:latest       public reverse proxy/auth
netbird-traefik  traefik:v3.6                         public 80/443
```

ERPNext production is not in Docker. It runs in LXD:

```text
LXD container: lxd-arm
LXD IP: 10.192.135.2
ERPNext site: erp.thaiduy.digital
Bench path: /home/ubuntu/frappe/frappe-bench
nginx inside LXD: 0.0.0.0:8001
gunicorn inside LXD: 127.0.0.1:8000
```

Useful LXD checks:

```bash
lxc list
lxc exec lxd-arm -- sh -lc 'ss -lntp || netstat -lntp || true'
lxc exec lxd-arm -- su - ubuntu -lc 'cd /home/ubuntu/frappe/frappe-bench && bench --site erp.thaiduy.digital mariadb -e "select name, employee_name, status, company, department from \`tabEmployee\` order by modified desc limit 5;"'
```

Current ERPNext data known from testing:

```text
Employee record:
HR-EMP-00001
employee_name: Tèo Văn Nguyễn
status: Active
company: Thái Duy Digital
department: Human Resources - TDD
```

### Important Networking Discovery

Public ERPNext URL:

```text
https://erp.thaiduy.digital
```

This public URL is protected by NetBird proxy/auth/IP restrictions. Browser access may work for an authenticated user, but server-side n8n requests from the VPS were blocked before reaching ERPNext.

Observed public failure:

```text
HTTP/2 403
Forbidden
```

NetBird proxy log showed:

```text
host=erp.thaiduy.digital
status=403
origin=auth
IP restriction: country_restricted for 138.2.99.208
```

Direct internal URL that reaches ERPNext nginx:

```text
http://10.192.135.2:8001
```

Therefore the live n8n ERPNext credential should use:

```text
Site URL: http://10.192.135.2:8001
Site Host Header: erp.thaiduy.digital
API Key: ERPNext admin API key
API Secret: ERPNext admin API secret
Ignore SSL Issues: false
```

This bypasses NetBird public auth while still sending ERPNext the expected host.

### Current n8n Credential

Live n8n has one ERPNext credential:

```text
Credential id: 9hFY985G0WpX5Xyt
Credential name: ERPNext account
Credential type: erpNextApi
Updated: 2026-05-13 05:53:33.641+00
```

Do not print the API key/secret into logs. They are stored encrypted in n8n.

DB query used to inspect credentials:

```bash
docker exec n8n-postgres-1 psql -U n8n_admin -d n8n_db -c "select id, name, type, \"updatedAt\" from credentials_entity where type='erpNextApi';"
```

### Current Live Workflows

Two workflows created by this project are active in live n8n.

#### Workflow 1: API v1 Employee GET

```text
Workflow name: ERPNext HRMS GET Employees Webhook
Workflow id: cY31OLkUamjHrm01
Active: true
Active version id: 709db8e0-85bd-4fff-9a5c-a1e826afde35
Artifact file: n8n-webhook-erpnext-hrms-get-employees.workflow.json
```

Webhook:

```text
Method: GET
Path: erpnext-hrms-get-employees
Local URL: http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
Public URL: https://n8n.thaiduy.store/webhook/erpnext-hrms-get-employees
```

Workflow graph:

```text
GET Webhook -> Get Active Employees
```

ERPNext HRMS node parameters:

```text
resource: employee
apiVersion: v1
operation: getMany
fields: name,employee_name,status,company,department
filtersJson: [["status","=","Active"]]
returnAll: false
limit: 10
orderBy: modified desc
credential: ERPNext account (9hFY985G0WpX5Xyt)
```

This calls Frappe v1:

```text
GET /api/resource/Employee
```

with query params roughly:

```text
fields=["name","employee_name","status","company","department"]
filters=[["status","=","Active"]]
limit_page_length=10
order_by=modified desc
```

Test command:

```bash
curl -i --connect-timeout 20 http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
```

Known successful response:

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

Known successful execution:

```text
Execution id: 3106
Status: success
Mode: webhook
Started: 2026-05-13 06:07:37.612+00
Stopped: 2026-05-13 06:07:37.668+00
```

#### Workflow 2: API v2 Employee GET

```text
Workflow name: ERPNext HRMS V2 GET Employees Webhook
Workflow id: cY31OLkUamjHrm02
Active: true
Active version id: da53b4ed-4283-4c6f-979b-9756c4b57dd1
Artifact file: n8n-webhook-erpnext-hrms-v2-get-employees.workflow.json
```

Webhook:

```text
Method: GET
Path: erpnext-hrms-v2-get-employees
Local URL: http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employees
Public URL: https://n8n.thaiduy.store/webhook/erpnext-hrms-v2-get-employees
```

Workflow graph:

```text
GET Webhook -> Get Active Employees V2
```

ERPNext HRMS node parameters:

```text
resource: employee
apiVersion: v2
operation: getMany
fields: name,employee_name,status,company,department
filtersJson: [["status","=","Active"]]
returnAll: false
limit: 10
orderBy: modified desc
credential: ERPNext account (9hFY985G0WpX5Xyt)
```

This calls Frappe v2:

```text
GET /api/v2/document/Employee
```

with query params roughly:

```text
fields=["name","employee_name","status","company","department"]
filters=[["status","=","Active"]]
limit=10
order_by=modified desc
```

Test command:

```bash
curl -i --connect-timeout 20 http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employees
```

Known successful response:

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

Known successful execution:

```text
Execution id: 3107
Status: success
Mode: webhook
Started: 2026-05-13 06:19:44.387+00
Stopped: 2026-05-13 06:19:44.456+00
```

### How Workflow JSON Artifacts Relate To Live n8n

The workflow JSON files in this repo are import artifacts. They are useful for recreating workflows, but live truth is in the n8n Postgres database.

The JSON files have `"active": false` because import artifacts usually should not auto-activate themselves. After import, the workflows were activated and published through n8n CLI:

```bash
docker exec n8n sh -lc 'n8n import:workflow --input=/tmp/<workflow>.json --projectId=cCM9DPW0X6pYUPeY'
docker exec n8n sh -lc 'n8n update:workflow --id=<workflowId> --active=true'
docker exec n8n sh -lc 'n8n publish:workflow --id=<workflowId>'
docker restart n8n
```

The personal project id used for imports:

```text
cCM9DPW0X6pYUPeY
```

The n8n user/project seen during testing:

```text
User id: 12df4922-f197-42b5-8d31-057a89e392c1
Email: th.dangduy@gmail.com
Project id: cCM9DPW0X6pYUPeY
Project name: Thái Duy <th.dangduy@gmail.com>
```

### How To Verify Live State

List workflows:

```bash
docker exec n8n sh -lc 'n8n list:workflow'
```

Check the two project workflows:

```bash
docker exec n8n-postgres-1 psql -U n8n_admin -d n8n_db -c "select id, name, active, \"activeVersionId\" from workflow_entity where id in ('cY31OLkUamjHrm01','cY31OLkUamjHrm02') order by id;"
```

Check latest executions:

```bash
docker exec n8n-postgres-1 psql -U n8n_admin -d n8n_db -c "select id, \"workflowId\", status, mode, \"startedAt\", \"stoppedAt\" from execution_entity where \"workflowId\" in ('cY31OLkUamjHrm01','cY31OLkUamjHrm02') order by \"startedAt\" desc limit 10;"
```

Check n8n logs:

```bash
docker logs --since 5m n8n 2>&1 | tail -220
```

Call webhooks:

```bash
curl -i --connect-timeout 20 http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
curl -i --connect-timeout 20 http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employees
```

Check ERPNext data directly:

```bash
lxc exec lxd-arm -- su - ubuntu -lc 'cd /home/ubuntu/frappe/frappe-bench && bench --site erp.thaiduy.digital mariadb -e "select name, employee_name, status, company, department from \`tabEmployee\` order by modified desc limit 5;"'
```

### Known Warnings And Issues

1. n8n logs show:

```text
ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
```

This is from Express rate limit because `X-Forwarded-For` is present but n8n `trust proxy` is not configured. It did not block local webhook tests. If public traffic matters, configure n8n trust proxy according to the reverse proxy setup.

2. n8n logs may show:

```text
Failed to start Python task runner in internal mode. because Python 3 is missing from this system.
```

This is an n8n environment warning unrelated to this ERPNext node.

3. Public ERPNext URL may return plain:

```text
403 Forbidden
```

This is probably NetBird proxy auth/IP restriction, not ERPNext API credential failure. Use the internal ERPNext URL plus `Site Host Header`.

4. `npm install`/audit reported critical vulnerabilities in the dependency tree. Do not blindly run `npm audit fix --force` because it may introduce breaking changes. Review before release.

5. The package version is still `0.1.0`. If publishing publicly, bump version and run full build/lint/pack verification.

6. `submit` and `cancel` currently call v1-style Frappe methods:

```text
/api/method/frappe.client.submit
/api/method/frappe.client.cancel
```

They do not switch to `/api/v2/method/...` inside `frappeRunDocAction()`. This has not been tested in the live session.

7. API v2 `getMany` has been tested successfully for Employee. Other operations/resources still need targeted testing before claiming complete API v2 coverage.

### Public Readiness Status

The node is technically publicable in the sense that:

- It builds.
- It lints.
- It packs.
- The tarball installs in production mode.
- n8n can load the credential and node.
- Live n8n workflows using the node succeed.
- API v1 `getMany Employee` works.
- API v2 `getMany Employee` works.

Before npm publishing, recommended release checklist:

```text
1. Review README for public language and remove environment-specific secrets/details if needed.
2. Bump package version from 0.1.0 if publishing a new tarball.
3. Run npm run build.
4. Run npm run lint.
5. Run npm pack --dry-run.
6. Run npm pack.
7. Test production install from tarball.
8. Optionally test create/update/get/delete with a safe test DocType or sandbox ERPNext site.
9. npm login.
10. npm publish.
```

### Mental Model Of The Running Data Flow

For the v1 workflow:

```text
Caller
  -> GET http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
  -> n8n Webhook node
  -> ERPNext HRMS node
  -> Credential erpNextApi adds Authorization: token api_key:api_secret
  -> HTTP request to http://10.192.135.2:8001
  -> Host header erp.thaiduy.digital
  -> LXD lxd-arm nginx :8001
  -> Frappe/ERPNext gunicorn :8000
  -> /api/resource/Employee
  -> returns Frappe JSON data
  -> node converts response.data to n8n items
  -> Webhook responds with all entries as JSON
```

For the v2 workflow, the same flow applies except the ERPNext endpoint is:

```text
/api/v2/document/Employee
```

### Quick Recovery Commands

If n8n is restarted and workflows do not appear active:

```bash
docker exec n8n sh -lc 'n8n update:workflow --id=cY31OLkUamjHrm01 --active=true'
docker exec n8n sh -lc 'n8n publish:workflow --id=cY31OLkUamjHrm01'
docker exec n8n sh -lc 'n8n update:workflow --id=cY31OLkUamjHrm02 --active=true'
docker exec n8n sh -lc 'n8n publish:workflow --id=cY31OLkUamjHrm02'
docker restart n8n
```

If n8n cannot load the node:

```bash
npm run build
npm pack
docker cp /home/ubuntu/n8n2erpnext/n8n-nodes-erpnext-hrms/n8n-nodes-erpnext-hrms-0.1.0.tgz n8n:/tmp/n8n-nodes-erpnext-hrms-0.1.0.tgz
docker exec n8n sh -lc 'cd /home/node/.n8n/nodes && npm install /tmp/n8n-nodes-erpnext-hrms-0.1.0.tgz --omit=dev'
docker restart n8n
```

If ERPNext API calls fail:

```bash
curl -i --connect-timeout 10 -H 'Host: erp.thaiduy.digital' http://10.192.135.2:8001/api/resource/Employee?limit_page_length=1
docker logs --since 5m n8n 2>&1 | tail -220
lxc exec lxd-arm -- su - ubuntu -lc 'cd /home/ubuntu/frappe/frappe-bench && bench --site erp.thaiduy.digital mariadb -e "select count(*) from \`tabEmployee\`;"'
```

## 2026-05-13 Security Audit, Stress Test, And GET Retest

User requested a simulated enterprise-style security audit for data leakage, stress testing, and a full retest of GET behavior.

### Security Scan: Repository Secrets

Command used:

```bash
rg -n --hidden -g '!node_modules/**' -g '!dist/**' -g '!.git/**' -g '!*.tgz' -i 'api[_ -]?secret|api[_ -]?key|password|passwd|token|authorization|secret|private[_ -]?key|BEGIN (RSA|OPENSSH|EC|PRIVATE)' .
```

Result:

- No real API key, API secret, private key, or bearer token was found in source files.
- Matches are documentation placeholders, credential field names, or warnings.
- `SESSION_LOG.md` and `README.md` contain environment-specific operational details:
  - internal ERPNext URL: `http://10.192.135.2:8001`
  - public domains: `erp.thaiduy.digital`, `n8n.thaiduy.store`
  - workflow IDs and credential ID
- These are useful for operational continuity but should be reviewed or removed before publishing the repo publicly.

### Security Scan: Package Contents

Command used:

```bash
npm pack --dry-run
```

Result:

- Tarball contains only:
  - `dist/**`
  - `README.md`
  - `LICENSE`
  - `package.json`
- No `SESSION_LOG.md`.
- No workflow JSON files.
- No `.env`, DB dump, credential export, source TypeScript, or `node_modules`.
- Package contents look safe from a direct secret leakage standpoint.

### Security Scan: Dependency Audit

Command used:

```bash
npm audit --omit=dev
```

Result:

```text
form-data 4.0.0 - 4.0.3
Severity: critical
form-data uses unsafe random function in form-data for choosing boundary
fix available via npm audit fix --force
Will install n8n-workflow@2.16.0, which is a breaking change
n8n-workflow 1.17.1 - 2.6.0 depends on vulnerable versions of form-data
2 critical severity vulnerabilities
```

Decision:

- Do not run `npm audit fix --force` blindly.
- It would upgrade `n8n-workflow` to a breaking version.
- Before public release, review whether `n8n-workflow` should stay as a runtime dependency, a peer dependency, or be pinned differently based on n8n community-node packaging expectations.

### Security Finding: GET Single Can Leak Full Employee PII

During GET single testing, `operation: get` returned the full Employee document. The response included more than the safe list fields, including examples such as:

- owner email
- user id / personal email style field
- date of birth
- address field
- approvers
- salary-related metadata
- many null HR fields

This is expected behavior for Frappe document GET, but it is risky if exposed through a public webhook.

Mitigation applied:

- Created a temporary workflow to test `get` single.
- After testing, deactivated that workflow.
- Final active public-ish test workflows are only `getMany` with explicit field selection:
  - `name`
  - `employee_name`
  - `status`
  - `company`
  - `department`

Recommended future hardening:

- Add optional field filtering for `operation: get`, or document that `get` returns the full document.
- Use n8n Webhook authentication for any public endpoint.
- Avoid exposing `get` single webhooks publicly unless the response is filtered by a Set/Code node.
- Prefer `getMany` with `fields` for public or semi-public read endpoints.

### Bug Found And Fixed: API v2 Named Document Redirect Timeout

While testing `operation: get` with `apiVersion: v2`, the request timed out.

Failing behavior:

```text
GET /api/v2/document/Employee/HR-EMP-00001/
```

Direct test showed Frappe/nginx redirected this trailing-slash URL:

```text
301 Location: http://erp.thaiduy.digital:8001/api/v2/document/Employee/HR-EMP-00001
```

n8n followed the redirect and eventually returned:

```text
ETIMEDOUT
The connection timed out, consider setting the 'Retry on Fail' option in the node settings
```

Fix applied in:

```text
nodes/ErpNextHrms/GenericFunctions.ts
```

Changed v2 named document endpoint from:

```ts
return name ? `${base}/${encodeURIComponent(name)}/` : base;
```

to:

```ts
return name ? `${base}/${encodeURIComponent(name)}` : base;
```

After the fix:

- `npm run build` passed.
- `npm run lint` passed.
- `npm pack` passed.
- Production install from tarball passed.
- Updated tarball installed into live n8n.
- n8n restarted.
- API v2 `get` single passed.

### Temporary GET Single Test Workflow

Created workflow artifact:

```text
n8n-webhook-erpnext-hrms-get-employee-by-id.workflow.json
```

Imported workflow:

```text
Workflow name: ERPNext HRMS GET Employee By ID Webhooks
Workflow id: cY31OLkUamjHrm03
```

It had two webhooks:

```text
GET /webhook/erpnext-hrms-get-employee?name=HR-EMP-00001
GET /webhook/erpnext-hrms-v2-get-employee?name=HR-EMP-00001
```

Both called `operation: get` for Employee:

```text
v1 -> /api/resource/Employee/HR-EMP-00001
v2 -> /api/v2/document/Employee/HR-EMP-00001
```

Test results:

- v1 get single: HTTP 200, returned full Employee document.
- v2 get single: HTTP 200 after code fix, returned full Employee document.

Final security state:

- This workflow was deactivated after testing to avoid exposing full Employee PII.
- Confirmed deactivation:

```text
cY31OLkUamjHrm03 active: false
```

After deactivation, calling:

```bash
curl -sS -i --max-time 10 --connect-timeout 5 'http://127.0.0.1:5678/webhook/erpnext-hrms-get-employee?name=HR-EMP-00001'
```

returns:

```json
{"code":404,"message":"Active version not found for workflow with id \"cY31OLkUamjHrm03\""}
```

This is expected and desired for security.

### GET Feature Retest Matrix

Final retest after the v2 endpoint fix:

#### getMany v1

Endpoint:

```text
GET http://127.0.0.1:5678/webhook/erpnext-hrms-get-employees
```

Result:

```text
HTTP 200
```

Body:

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

#### getMany v2

Endpoint:

```text
GET http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employees
```

Result:

```text
HTTP 200
```

Body:

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

#### get single v1

Endpoint:

```text
GET http://127.0.0.1:5678/webhook/erpnext-hrms-get-employee?name=HR-EMP-00001
```

Result during test:

```text
HTTP 200
```

Returned full Employee document. Workflow later deactivated for security.

#### get single v2

Endpoint:

```text
GET http://127.0.0.1:5678/webhook/erpnext-hrms-v2-get-employee?name=HR-EMP-00001
```

Result after code fix:

```text
HTTP 200
```

Returned full Employee document. Workflow later deactivated for security.

### Stress Test

Stress test used 4 local endpoints:

```text
/webhook/erpnext-hrms-get-employees
/webhook/erpnext-hrms-v2-get-employees
/webhook/erpnext-hrms-get-employee?name=HR-EMP-00001
/webhook/erpnext-hrms-v2-get-employee?name=HR-EMP-00001
```

Test shape:

```text
50 requests per endpoint
4 endpoints
200 total requests
concurrency: 10
```

Aggregate result:

```text
200 / 200 requests returned HTTP 200
0 errors
total duration: 6264 ms
```

Latency summary:

```text
getMany v1:
  min 263 ms
  p50 342 ms
  p95 389 ms
  max 400 ms

getMany v2:
  min 201 ms
  p50 295 ms
  p95 455 ms
  max 472 ms

get single v1:
  min 232 ms
  p50 288 ms
  p95 308 ms
  max 313 ms

get single v2:
  min 215 ms
  p50 280 ms
  p95 360 ms
  max 367 ms
```

Interpretation:

- Light local stress is healthy.
- No HTTP errors under concurrency 10.
- Results are local-network only and do not represent public internet latency.
- Stress test happened before deactivating the temporary get-single workflow.

### Final Live Workflow State After Audit

Active:

```text
cY31OLkUamjHrm01  ERPNext HRMS GET Employees Webhook       active true
cY31OLkUamjHrm02  ERPNext HRMS V2 GET Employees Webhook    active true
```

Inactive:

```text
cY31OLkUamjHrm03  ERPNext HRMS GET Employee By ID Webhooks active false
```

Reason for keeping `cY31OLkUamjHrm03` inactive:

```text
It exposes full Employee documents and therefore can leak HR/PII data if reachable publicly.
```

### Audit Conclusion

Current state is acceptable for internal enterprise testing:

- No real secrets found in repo source.
- Publish tarball does not include session logs/workflow artifacts.
- v1/v2 getMany endpoints work and return only selected fields.
- v1/v2 get single operations work, but should not be public without output filtering/auth.
- Light stress test passed.
- Dependency audit has unresolved critical advisories inherited from `n8n-workflow -> form-data`; review before public npm release.

## 2026-05-13 Final GET Audit Across All Supported Resources

User requested one final GET audit across every supported resource/function before public evaluation.

### Pre-Test Data Count

Checked ERPNext production DB before the node audit:

```text
Employee           1
Attendance         1
Employee Checkin   1
Leave Application  0
Leave Allocation   0
Expense Claim      0
Salary Slip        0
Shift Assignment   0
Holiday List       1
User               4
```

Important note:

- User expected data for `Leave Application` and `Leave Allocation`.
- Direct DB count returned `0` for both at the time of the test.
- Therefore the expected node behavior for those resources is HTTP 200 with `[]`, not an error.

### Temporary Final Audit Workflow

Created workflow artifact:

```text
n8n-webhook-erpnext-hrms-final-get-audit.workflow.json
```

Imported temporary workflow:

```text
Workflow name: ERPNext HRMS Final GET Audit Webhooks
Workflow id: cY31OLkUamjHrm04
```

This workflow created one GET webhook per supported resource/function. It used API v2 for document resources and v1 for the whitelisted Frappe method test.

The workflow was activated only for testing and then deactivated to avoid exposing many public audit endpoints.

### Final GET Audit Result

All resource/function endpoints returned HTTP 200.

Summary:

```text
Employee                  HTTP 200  count 1
Attendance                HTTP 200  count 1
Employee Checkin          HTTP 200  count 1
Leave Application         HTTP 200  count 0
Leave Allocation          HTTP 200  count 0
Expense Claim             HTTP 200  count 0
Salary Slip               HTTP 200  count 0
Shift Assignment          HTTP 200  count 0
Holiday List              HTTP 200  count 1
Custom DocType Company    HTTP 200  count 1
Frappe Method get_count   HTTP 200  result 1
```

Detailed preview:

```json
[
  {
    "name": "Employee",
    "status": 200,
    "count": 1,
    "preview": {
      "name": "HR-EMP-00001",
      "employee_name": "Tèo Văn Nguyễn",
      "status": "Active",
      "company": "Thái Duy Digital",
      "department": "Human Resources - TDD"
    }
  },
  {
    "name": "Attendance",
    "status": 200,
    "count": 1,
    "preview": {
      "name": "HR-ATT-2026-00001",
      "employee": "HR-EMP-00001",
      "status": "Half Day",
      "attendance_date": "2026-05-15",
      "company": "Thái Duy Digital"
    }
  },
  {
    "name": "Employee Checkin",
    "status": 200,
    "count": 1,
    "preview": {
      "name": "EMP-CKIN-05-2026-000001",
      "employee": "HR-EMP-00001",
      "time": "2026-05-13 16:21:13",
      "log_type": "IN"
    }
  },
  {
    "name": "Holiday List",
    "status": 200,
    "count": 1,
    "preview": {
      "name": "Default Holiday List",
      "holiday_list_name": "Default Holiday List",
      "from_date": "2026-05-13",
      "to_date": "2026-12-31"
    }
  },
  {
    "name": "Custom DocType Company",
    "status": 200,
    "count": 1,
    "preview": {
      "name": "Thái Duy Digital"
    }
  },
  {
    "name": "Frappe Method Employee Count",
    "status": 200,
    "preview": 1
  }
]
```

Resources with no records returned HTTP 200 and empty arrays:

```text
Leave Application
Leave Allocation
Expense Claim
Salary Slip
Shift Assignment
```

### Temporary Audit Workflow Deactivated

After the final audit, deactivated:

```text
cY31OLkUamjHrm04  ERPNext HRMS Final GET Audit Webhooks
```

Final state:

```text
cY31OLkUamjHrm04 active: false
```

Reason:

```text
The audit workflow exposes many temporary GET endpoints and should not stay public.
```

### Final Live Workflow State After Final Audit

Active:

```text
cY31OLkUamjHrm01  ERPNext HRMS GET Employees Webhook       active true
cY31OLkUamjHrm02  ERPNext HRMS V2 GET Employees Webhook    active true
```

Inactive:

```text
cY31OLkUamjHrm03  ERPNext HRMS GET Employee By ID Webhooks active false
cY31OLkUamjHrm04  ERPNext HRMS Final GET Audit Webhooks    active false
```

Final verification after deactivating the audit workflow:

```text
GET /webhook/erpnext-hrms-get-employees     HTTP 200
GET /webhook/erpnext-hrms-v2-get-employees  HTTP 200
```

### Public Evaluation Status

GET coverage is strong enough for public evaluation:

- All supported HRMS resources were exercised through the n8n node with `getMany`.
- `Custom DocType` was exercised with `Company`.
- `Frappe Method` was exercised with `frappe.client.get_count`.
- Empty DocTypes returned safely as `[]`.
- Active public demo endpoints are limited to selected Employee fields to reduce PII exposure.

Remaining caution before public/npm release:

- Dependency audit still reports critical advisory inherited through `n8n-workflow -> form-data`.
- Full create/update/delete/submit/cancel matrix has not been exhaustively tested across every DocType.
- Do not keep temporary audit workflows active in production.

## 2026-05-13 README Security And Publication Polish

Updated `README.md` for a more public-ready SME and mid-market ERP audience.

Added:

- Clear target audience for IT ERP, HRIS, operations, and integration teams.
- API v1/v2 explanation for ERPNext/Frappe document endpoints.
- Production credential guidance recommending a dedicated scoped ERPNext integration user instead of daily admin credentials.
- Security baseline for HRMS data, webhook exposure, execution logs, key rotation, scoped fields, and internal-network deployment.
- Required security notice: `Security notice: form-data vulnerability is acknowledged but mitigated by infrastructure/scoped API access.`
- Deployment checklist for SME and mid-market teams before go-live.
- Troubleshooting notes for auth errors, TLS `EPROTO`, empty responses, wrong Frappe site host, inactive n8n webhooks, and unexpected sensitive fields.
- Scope and roadmap hardening notes before wider public adoption.
- Codex acknowledgement/signature at the end of the README as requested.

No code behavior was changed in this documentation pass.
