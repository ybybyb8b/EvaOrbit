# Future MCP boundary

No MCP endpoint is exposed in this release. A future remote MCP adapter must call
`src/lib/services/evaorbit.ts` rather than reimplementing Tasks, Memory, or
Conversation behavior.

Remote MCP requirements: HTTPS, authenticated identity, authorization on every
tool, server-side database access, no database or provider secrets in tool
responses, and explicit write protection for mutating tools. Tools such as
`search_memory`, `add_memory`, `list_tasks`, `create_task`, `update_task`, and
`write_chronicle` must preserve the same per-user RLS boundary as the web app.
