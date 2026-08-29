# EvaOrbit Remote MCP

- Endpoint: `https://<your-domain>/api/mcp`
- Transport: stateless Streamable HTTP; there is no legacy `/sse` endpoint
- Authentication: Supabase OAuth 2.1 access token in `Authorization: Bearer <token>`

## Environment

Set the existing Supabase values locally and in Vercel:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_example
```

Enable the Supabase OAuth Server, Dynamic OAuth Apps, and set its authorization path to `/oauth/consent`. The MCP resource identifier is `https://eva-orbit.vercel.app/api/mcp`.

## Tools

The original 16 dedicated tools remain available unchanged:

- `food_search_recent`
- `food_create`
- `food_update`
- `food_delete`
- `food_library_search`
- `food_library_create`
- `food_library_update`
- `food_library_delete`
- `drink_search_recent`
- `drink_create`
- `drink_update`
- `drink_delete`
- `nutrition_get_daily_summary`
- `daily_energy_upsert`
- `tracker_list`
- `tracker_create_entry`

The stable Generic Resource Layer adds:

- `eo_resources`
- `eo_schema`
- `eo_search`
- `eo_get`
- `eo_create`
- `eo_update`
- `eo_delete`
- `eo_action`

Generic tools keep `resource` as a plain string. Call `eo_resources`, then `eo_schema`, before operating on a resource. The server-side registry—not the client—decides which resources, fields, capabilities, validations, and actions are available. The current registry contains `memo`, `chronicle`, `lucius_diary`, and `lucius_case`. Memo searches default to current-active records unless a status filter is supplied. `lucius_case` exposes the `record_recurrence` business action; the server updates recurrence counters and dates atomically.

## Local test

Complete the Supabase OAuth authorization-code flow, then POST an MCP initialize request with the issued access token:

```powershell
$headers = @{ Authorization = "Bearer $env:SUPABASE_OAUTH_ACCESS_TOKEN"; Accept = "application/json, text/event-stream" }
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0"}}}'
Invoke-RestMethod http://localhost:3000/api/mcp -Method Post -Headers $headers -ContentType application/json -Body $body
```

For ChatGPT, select OAuth and enter `https://eva-orbit.vercel.app/api/mcp`. For MCP Inspector, choose Streamable HTTP, enter the endpoint URL, complete OAuth, and use the issued access token.
