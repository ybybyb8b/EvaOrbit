import assert from "node:assert/strict";
import test from "node:test";
import { maskApiKey, startChatCompletion } from "./ai-provider.ts";
import type { InternalAiSettings } from "./repositories/types.ts";

const settings: InternalAiSettings = {
  providerPreset: "custom",
  providerName: "Mock",
  baseUrl: "https://mock.example/v1",
  apiKey: "test-key",
  providerId: 1,
  modelConfigId: 1,
  hasApiKey: true,
  maskedApiKey: null,
  model: "mock-model",
  enabled: true,
  temperature: 0.4,
  systemPrompt: "Test",
  responseLength: "balanced",
  initiative: "quiet",
  allowSuggestions: true,
  allowTeasing: true,
  includeTasks: false,
  includeMemories: false,
  allowWriteActions: false,
  userDisplayName: "我",
  userAvatarType: "default",
  userAvatarValue: "",
  assistantDisplayName: "Eva",
  assistantAvatarType: "default",
  assistantAvatarValue: "",
  showUserName: true,
  showAssistantName: true,
  showAvatars: true,
  updatedAt: "",
};

test("only exposes a stable API Key mask", () => {
  assert.equal(maskApiKey("sk-example-x9K2"), "••••••••••••x9K2");
  assert.equal(maskApiKey(""), null);
});

test("sends standard OpenAI tool definitions to the configured provider", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let payload: { tools?: Array<{ function?: { name?: string } }>; messages?: Array<{ role?: string; content?: string }> } = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    payload = JSON.parse(String(init?.body));
    return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const response = await startChatCompletion(settings, [{ role: "user", content: "hello" }]);
    assert.equal(response.ok, true);
    assert.equal(requestUrl, "https://mock.example/v1/chat/completions");
    assert.ok(payload.messages?.some((message) => message.role === "system"));
    const systemPrompt = payload.messages?.find((message) => message.role === "system")?.content ?? "";
    assert.match(systemPrompt, /\[CORE IDENTITY\]/);
    assert.match(systemPrompt, /Self Persona/);
    assert.match(systemPrompt, /\[CURRENT TIME\]/);
    assert.match(systemPrompt, /本人补充的 Persona 说明：Test/);
    const toolNames = payload.tools?.map((tool) => tool.function?.name) ?? [];
    for (const name of ["list_tasks", "search_memories", "create_task", "create_memory", "create_inbox", "convert_inbox_item", "get_today_food", "search_food_library", "create_food_log", "get_today_drinks", "create_drink_log", "check_drink_limit", "get_daily_nutrition_summary"]) {
      assert.ok(toolNames.includes(name), `missing AI tool: ${name}`);
    }
    assert.match(systemPrompt, /品牌已知时必须匹配品牌/);
    assert.match(systemPrompt, /饮品限制只报告数量和状态/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
