import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the real MCP route filters discovery and records, honors old-token revocation and reuses Inbox receipts", () => {
  const program = String.raw`
    import assert from "node:assert/strict";
    import { generateKeyPairSync, sign } from "node:crypto";
    import { POST } from "./src/app/api/mcp/route.ts";
    import { CHATGPT_CLIENT } from "./src/lib/mcp/agent-policy.ts";
    import { MCP_RESOURCE } from "./src/lib/mcp-identity.ts";
    const codex = "11111111-1111-4111-8111-111111111111";
    const hermes = "22222222-2222-4222-8222-222222222222";
    const pending = "33333333-3333-4333-8333-333333333333";
    const owner = "44444444-4444-4444-8444-444444444444";
    const secondOwner = "55555555-5555-4555-8555-555555555555";
    const writeId = "66666666-6666-4666-8666-666666666666";
    const legacy = { state:"active", policy:{ permissions:["echo:search","memory_context:search","inbox:create"],inboxOwn:false }};
    const connections = new Map([
      [owner+codex,{state:"active", policy:{ permissions:["project:search","project:get","project_item:search","project_item:get"],projectIds:[10] }}],
      [owner+hermes,{state:"active", policy:{ permissions:["inbox:search","inbox:get","inbox:create"] }}],
      [owner+CHATGPT_CLIENT,legacy],
    ]);
    const audit = [], receipts = new Map();
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve:"P-256" });
    const jwk = {...publicKey.export({ format:"jwk" }), kid:"only-key", alg:"ES256", key_ops:["verify"]};
    function token(clientId, sub=owner) {
      const now=Math.floor(Date.now()/1000);
      const encode=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
      const input = encode({alg:"ES256",kid:jwk.kid,typ:"JWT"})+"."+encode({
        iss:process.env.SUPABASE_URL+"/auth/v1", aud:MCP_RESOURCE, sub, client_id:clientId,
        exp:now+600, iat:now, role:"authenticated", scope:"openid",
      });
      return input+"."+sign("sha256",Buffer.from(input),{key:privateKey,dsaEncoding:"ieee-p1363"}).toString("base64url");
    }
    const projectData = [20,10].map(id=>({id,name:"Project "+id,description:"",status:"active",project_items:[],created_at:"2026-11-18",updated_at:"2026-11-18"}));
    const itemData = [20,10].map(project_id=>({id:project_id+100,project_id,projects:{name:"Project "+project_id},title:"Item "+project_id,status:"doing",type:"feature",created_at:"2026-11-18",updated_at:"2026-11-18"}));
    const inbox = [{id:1,agent_client_id:null,content:"private Web capture",status:"inbox"}];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input,init), url = new URL(request.url);
      if (url.pathname.endsWith("/jwks.json")) return Response.json({ keys:[jwk] });
      assert.equal(url.origin, process.env.SUPABASE_URL);
      if (request.headers.get("x-evaorbit-agent-bridge") !== process.env.EVAORBIT_AGENT_BRIDGE_KEY) return Response.json({message:"scope denied"},{status:403});
      const {client_id, sub} = JSON.parse(Buffer.from(request.headers.get("authorization").split(".")[1],"base64url"));
      const table = url.pathname.split("/").at(-1), query = url.searchParams;
      if (table === "evaorbit_agent_session") {
        return Response.json({client_id,state:"pending",expires_at:null,policy:{},...connections.get(sub+client_id)});
      }
      if (table === "evaorbit_agent_audit") {
        const event=await request.json();
        audit.push(event);
        return Response.json(audit.length);
      }
      if (table === "evaorbit_agent_capture") {
        const data=await request.json();
        if (receipts.has(client_id+data.p_request_id)) return Response.json(receipts.get(client_id+data.p_request_id));
        const record={id:inbox.length+1,agent_client_id:client_id,content:data.p_content,status:"inbox",source:"chatgpt",converted_id:null};
        if(data.p_request_id)receipts.set(client_id+data.p_request_id,record);
        inbox.push(record);
        return Response.json(record);
      }
      const rows = {projects:projectData,project_items:itemData,inbox_items:inbox}[table];
      assert.ok(rows, table);
      const scopeColumn = {projects:"id",project_items:"project_id",inbox_items:"agent_client_id"}[table];
      const scope = query.get(scopeColumn);
      assert.equal(scope, table==="inbox_items" ? "eq."+hermes : table==="projects" && query.get("id")?.startsWith("eq.") ? "eq.10" : "in.(10)");
      const filtered = rows.filter(row=>[...query].every(([key,value])=>{
        if(value.startsWith("eq.")) return String(row[key])===value.slice(3);
        if(value.startsWith("in.(")) return value.slice(4,-1).split(",").includes(String(row[key]));
        return true;
      }));
      return Response.json(filtered.slice(0, Number(query.get("limit")??1000)));
    };
    let id=0;
    async function rpc(jwt, method, params) {
      const response = await POST(new Request(MCP_RESOURCE,{method:"POST",headers:{
        authorization:"Bearer "+jwt, "Content-Type":"application/json", Accept:"application/json, text/event-stream",
        "MCP-Protocol-Version":"2025-03-26",
      },body:JSON.stringify({jsonrpc:"2.0",id:++id,method,params})}));
      assert.equal(response.status,200,await response.clone().text());
      const raw=await response.text();
      const envelope=JSON.parse(response.headers.get("content-type")?.includes("text/event-stream")
        ? raw.split("\n").find(line=>line.startsWith("data:")).slice(5) : raw);
      assert.equal(envelope.error,undefined,JSON.stringify(envelope));
      return envelope.result;
    }
    const tool = (jwt,name,args={})=>rpc(jwt,"tools/call",{name,arguments:args});
    const oldCodex = token(codex), oldHermes = token(hermes), chatgpt = token(CHATGPT_CLIENT);
    const list = async jwt=>(await rpc(jwt,"tools/list")).tools.map(({name})=>name);
    assert.deepEqual(await list(token(pending)),["eo_resources"]);
    assert.deepEqual(await list(oldCodex),["eo_resources","eo_schema","eo_search","eo_get"]);
    const listResources=(await tool(oldCodex,"eo_resources")).structuredContent.resources;
    assert.deepEqual(listResources.map(({resource})=>resource),["project","project_item"]);
    const projectSchema=(await tool(oldCodex,"eo_schema",{resource:"project"})).structuredContent.schema;
    assert.deepEqual(projectSchema.update_fields,[]);
    assert.equal((await tool(oldCodex,"eo_schema",{resource:"memo"})).isError,true);
    assert.equal((await tool(oldCodex,"eo_search",{resource:"memory_context",query:"testing"})).isError,true);
    assert.deepEqual((await tool(oldCodex,"eo_search",{resource:"project",limit:1})).structuredContent.items.map(({id})=>id),[10]);
    assert.deepEqual((await tool(oldCodex,"eo_search",{resource:"project_item",limit:1})).structuredContent.items.map(({id})=>id),[110]);
    assert.equal((await tool(oldCodex,"eo_get",{resource:"project_item",id:120})).isError,true);
    assert.equal((await tool(oldCodex,"eo_get",{resource:"project",id:20})).isError,true);
    for(const [name,args] of [["eo_create",{data:{name:"not allowed"}}],["eo_update",{id:10,data:{name:"not allowed"}}],["eo_delete",{id:10}],["eo_action",{id:10,action:"unknown"}]]) {
      assert.equal((await tool(oldCodex,name,{resource:"project",...args})).isError,true);
    }
    assert.equal((await tool(token(codex,secondOwner),"eo_search",{resource:"project"})).isError,true);
    const capture={resource:"inbox",data:{content:"private Hermes capture"},request_id:writeId};
    assert.equal((await tool(oldHermes,"eo_create",{...capture,request_id:undefined})).isError,true);
    const ownId=(await tool(oldHermes,"eo_create",capture)).structuredContent.item.id;
    assert.equal((await tool(oldHermes,"eo_create",capture)).structuredContent.item.id,ownId);
    assert.deepEqual((await tool(oldHermes,"eo_search",{resource:"inbox"})).structuredContent.items.map(({id})=>id),[ownId]);
    assert.equal((await tool(oldHermes,"eo_get",{resource:"inbox",id:1})).isError,true);
    connections.get(owner+codex).state="paused";
    assert.equal((await tool(oldCodex,"eo_get",{resource:"project",id:10})).isError,true);
    connections.get(owner+codex).state="active";
    assert.equal((await tool(oldCodex,"eo_get",{resource:"project",id:10})).structuredContent.item.id,10);
    connections.get(owner+codex).state="revoked";
    assert.equal((await tool(oldCodex,"eo_get",{resource:"project",id:10})).isError,true);
    assert.equal((await tool(token(codex),"eo_get",{resource:"project",id:10})).isError,true);
    assert.equal((await tool(chatgpt,"eo_schema",{resource:"memo"})).structuredContent.schema.canonical_resource,"echo");
    assert.equal((await tool(chatgpt,"eo_create",{resource:"inbox",data:{content:"existing integration call"}})).isError,undefined);
    assert.ok(audit.some(row=>row.p_result==="blocked"));
    assert.ok(audit.some(row=>row.p_result==="allowed"&&row.p_target===String(ownId)));
    assert.doesNotMatch(JSON.stringify(audit),/private Hermes capture|private Web capture|Bearer/);
  `;
  const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/typescript-test-loader.mjs", "--input-type=module", "--eval", program], {
    encoding:"utf8", timeout:30000,
    env:{ ...process.env, SUPABASE_URL:"https://agent-http.invalid", SUPABASE_PUBLISHABLE_KEY:"synthetic",
      EVAORBIT_DATA_BACKEND:"supabase", EVAORBIT_AGENT_BRIDGE_KEY:"a".repeat(64) },
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
});
