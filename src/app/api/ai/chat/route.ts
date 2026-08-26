import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { extractDelta, selectConversationHistory, startChatCompletion, type ProviderMessage } from "@/lib/ai-provider";
import { executeAiTool } from "@/lib/ai-tools";
import { addChatMessage, autoTitleChatSession, getAiRuntimeSettings, getChatSession, listChatMessages } from "@/lib/services/evaorbit";
import { ValidationError, parseChatRequest } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function event(data: object) {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

async function readCompletion(response: Response) {
  let content = "";
  const calls = new Map<number, ToolCall>();
  const accept = (payload: unknown, streamed: boolean) => {
    if (!payload || typeof payload !== "object") return;
    const choice = (payload as { choices?: Array<{ delta?: { tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; message?: { tool_calls?: ToolCall[] } }> }).choices?.[0];
    content += extractDelta(payload);
    if (!streamed && choice?.message?.tool_calls) {
      choice.message.tool_calls.forEach((call, index) => calls.set(index, call));
      return;
    }
    for (const part of choice?.delta?.tool_calls ?? []) {
      const index = part.index ?? 0;
      const current = calls.get(index) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
      current.id += part.id ?? "";
      current.function.name += part.function?.name ?? "";
      current.function.arguments += part.function?.arguments ?? "";
      calls.set(index, current);
    }
  };
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    accept(await response.json(), false);
  } else {
    const reader = response.body?.getReader();
    let buffer = "";
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const raw = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (!raw || raw === "[DONE]") continue;
        try { accept(JSON.parse(raw), true); } catch { /* provider keep-alive */ }
      }
    }
  }
  return { content, toolCalls: [...calls.values()].filter((call) => call.id && call.function.name) };
}

export async function POST(request: NextRequest) {
  try {
    const input = parseChatRequest(await request.json());
    const session = await getChatSession(input.sessionId);
    if (!session) throw new ValidationError("会话不存在");
    const settings = await getAiRuntimeSettings(session.modelConfigId);
    if (!settings.enabled) throw new ValidationError("请先在设置中启用 AI Provider");
    if (!settings.apiKey && settings.providerPreset !== "ollama") throw new ValidationError("请先配置 API Key");

    await addChatMessage(input.sessionId, "user", input.content, null, settings.providerId, settings.modelConfigId);
    await autoTitleChatSession(input.sessionId, input.content);
    const messages = await listChatMessages(input.sessionId);
    const selectedHistory = selectConversationHistory(messages);
    const history: ProviderMessage[] = selectedHistory.messages.map(({ role, content }) => ({ role, content }));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = "";
        try {
          const providerMessages = [...history];
          for (let round = 0; round < 4; round += 1) {
            const upstream = await startChatCompletion(settings, providerMessages, request.signal, {
              module: "想想 / 对话",
              sessionTitle: session.title,
              omittedMessages: selectedHistory.omittedMessages,
            });
            const completion = await readCompletion(upstream);
            if (!completion.toolCalls.length) {
              answer = completion.content;
              if (answer) controller.enqueue(event({ delta: answer }));
              break;
            }
            providerMessages.push({ role: "assistant", content: completion.content || null, tool_calls: completion.toolCalls });
            for (const call of completion.toolCalls) {
              let result: Awaited<ReturnType<typeof executeAiTool>>;
              try {
                result = await executeAiTool(call.function.name, JSON.parse(call.function.arguments || "{}"), settings.allowWriteActions);
              } catch (error) {
                result = { result: JSON.stringify({ error: error instanceof Error ? error.message : "工具调用失败" }), summary: `${call.function.name} 调用失败`, wrote: false };
              }
              controller.enqueue(event({ tool: { name: call.function.name, summary: result.summary, wrote: result.wrote } }));
              providerMessages.push({ role: "tool", tool_call_id: call.id, content: result.result });
            }
          }
          if (!answer.trim()) throw new Error("Provider 未返回文本内容");
          const message = await addChatMessage(input.sessionId, "assistant", answer, settings.model, settings.providerId, settings.modelConfigId);
          controller.enqueue(event({ done: true, message }));
        } catch (error) {
          controller.enqueue(event({ error: error instanceof Error ? error.message : "生成回复失败" }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
