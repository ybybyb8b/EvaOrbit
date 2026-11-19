export function parlorReplyFailure(error: string | undefined, english: boolean, interrupted = false) {
  const text = error?.toLowerCase() ?? "";
  const code = /\[eo:([\w.-]+)\]/.exec(text)?.[1];
  const status = Number(/\bhttp\s+(\d{3})\b/.exec(text)?.[1]);
  const retry = (en: string, zh: string) => ({ action: "retry" as const, reason: english ? en : zh });
  const settings = (en: string, zh: string) => ({ action: "settings" as const, reason: english ? en : zh });

  if (status === 402 || /\b(?:insufficient_quota|subscription_sharing_usage_limit_exceeded)\b/.test(text))
    return settings("The provider's usage quota has been reached.", "模型服务的可用额度不足。");
  if (/\bmodel_not_found\b/.test(text))
    return settings("This model is unavailable. Check the model settings.", "当前模型不可用，请检查模型设置。");
  if (status === 404)
    return settings("The service address or model is unavailable.", "服务地址或模型不可用。");
  if ([401, 403].includes(status) || /\b(?:invalid_api_key|invalid_grant|invalid_scope|invalid_client|access_denied)\b|configure a local api key|尚未授予.*权限/.test(text))
    return settings("The provider rejected the credentials or permissions.", "模型服务的凭据或权限需要检查。");
  if (code === "network_tls_failed" || /ai configuration or request is invalid|changing the endpoint/.test(text))
    return settings("The connection settings need attention.", "模型服务的连接设置需要检查。");
  if (status === 429 || /\brate_limit_exceeded\b/.test(text))
    return retry("The provider is limiting requests. Try again shortly.", "模型服务暂时限制请求，请稍后重试。");
  if (code === "network_timeout" || status === 408 || status === 504 || /timed? out|超时/.test(text))
    return retry("The request timed out.", "请求超时。");
  if (code === "network_offline")
    return retry("The device is offline. Check the connection.", "设备当前未联网，请检查网络。");
  if (code === "network_connection_lost" || /the connection ended before|网络中断/.test(text))
    return retry("The network connection was interrupted.", "网络连接中断。");
  if (code?.startsWith("network_"))
    return retry("The network connection could not be completed.", "网络连接未能完成，请检查网络。");
  if (status >= 500)
    return retry("The model service is temporarily unavailable.", "模型服务暂时不可用，请稍后重试。");
  if (interrupted || /响应未正常完成|synthetic restart/.test(text))
    return retry("Generation was interrupted before it finished.", "回复生成中断。");
  return retry("No specific cause was reported.", "未收到明确的失败原因。");
}
