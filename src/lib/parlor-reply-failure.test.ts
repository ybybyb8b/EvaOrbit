import assert from "node:assert/strict";
import test from "node:test";
import {parlorReplyFailure} from "./parlor-reply-failure.ts";

test("Parlor translates native diagnostics and preserves the appropriate recovery action", () => {
  const cases = [
    ["The server request timed out. (URL error -1001) [EO:network_timeout]", "retry", "请求超时。"],
    ["The network connection was interrupted. (URL error -1005) [EO:network_connection_lost]", "retry", "网络连接中断。"],
    ["Provider HTTP 503. Check configuration or limits; nothing retries automatically. [EO:ai_failed]", "retry", "模型服务暂时不可用，请稍后重试。"],
    ["[SIWC:inference.headers] HTTP 429 · JSON · insufficient_quota", "settings", "模型服务的可用额度不足。"],
    ["Provider HTTP 429. Check configuration or limits; nothing retries automatically. [EO:ai_failed]", "retry", "模型服务暂时限制请求，请稍后重试。"],
    ["[SIWC:inference.headers] HTTP 404 · JSON · model_not_found", "settings", "当前模型不可用，请检查模型设置。"],
    ["Provider HTTP 401. Check configuration or limits; nothing retries automatically. [EO:ai_failed]", "settings", "模型服务的凭据或权限需要检查。"],
    [undefined, "retry", "未收到明确的失败原因。"],
  ] as const;
  for (const [diagnostic, action, reason] of cases) {
    assert.deepEqual(parlorReplyFailure(diagnostic, false), {action, reason});
    assert.equal(parlorReplyFailure(diagnostic, true).action, action);
  }
  assert.deepEqual(parlorReplyFailure(undefined, false, true), {action:"retry", reason:"回复生成中断。"});
});
