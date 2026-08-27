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

- `food_search_recent`
- `food_create`
- `food_update`
- `food_delete`
- `drink_search_recent`
- `drink_create`
- `drink_update`
- `drink_delete`
- `nutrition_get_daily_summary`
- `tracker_list`
- `tracker_create_entry`

## Local test

Complete the Supabase OAuth authorization-code flow, then POST an MCP initialize request with the issued access token:

```powershell
$headers = @{ Authorization = "Bearer $env:SUPABASE_OAUTH_ACCESS_TOKEN"; Accept = "application/json, text/event-stream" }
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0"}}}'
Invoke-RestMethod http://localhost:3000/api/mcp -Method Post -Headers $headers -ContentType application/json -Body $body
```

For ChatGPT, select OAuth and enter `https://eva-orbit.vercel.app/api/mcp`. For MCP Inspector, choose Streamable HTTP, enter the endpoint URL, complete OAuth, and use the issued access token.
