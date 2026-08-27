# EvaOrbit Remote MCP

- Endpoint: `https://<your-domain>/api/mcp`
- Transport: stateless Streamable HTTP; there is no legacy `/sse` endpoint
- Authentication: `Authorization: Bearer <EVAORBIT_MCP_TOKEN>`

## Environment

Set these server-only values locally and in Vercel:

```env
EVAORBIT_MCP_TOKEN=<long-random-token>
SUPABASE_SECRET_KEY=<your-Supabase-secret-key>
```

The existing `SUPABASE_URL` and `EVAORBIT_ALLOWED_EMAIL` select the single EvaOrbit user. Never use a `NEXT_PUBLIC_` prefix for either secret.

## Tools

- `food_search_recent`
- `food_create`
- `food_update`
- `drink_create`
- `drink_update`
- `nutrition_get_daily_summary`
- `tracker_list`
- `tracker_create_entry`

## Local test

Start EvaOrbit with `EVAORBIT_MCP_TOKEN` set, then POST an MCP initialize request:

```powershell
$headers = @{ Authorization = "Bearer $env:EVAORBIT_MCP_TOKEN"; Accept = "application/json, text/event-stream" }
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0"}}}'
Invoke-RestMethod http://localhost:3000/api/mcp -Method Post -Headers $headers -ContentType application/json -Body $body
```

For MCP Inspector, run `npx @modelcontextprotocol/inspector`, choose Streamable HTTP, enter the endpoint URL, and add the same Authorization header. On Vercel, add the environment variables, redeploy, and use the production `/api/mcp` URL.
