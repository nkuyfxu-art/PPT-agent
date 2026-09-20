// 供应商适配层。当前支持 Chat Completions 兼容接口。
// 更换接口协议时只需在这里转换请求/响应，识别提示词和校验仍在 ai-api.js。
export function getAIConfig(env) {
  const visionModel = env.AI_VISION_MODEL || env.SILICONFLOW_VISION_MODEL || 'Qwen/Qwen3-VL-32B-Instruct';
  return {
    apiKey: env.AI_API_KEY || env.SILICONFLOW_API_KEY,
    baseURL: (env.AI_BASE_URL || env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/+$/, ''),
    visionModel,
    textModel: env.AI_TEXT_MODEL || visionModel,
  };
}

function parseModelJSON(content) {
  const raw = String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw Error('模型没有返回有效 JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

export async function callJSONModel(env, messages, maxTokens = 1600, kind = 'vision') {
  const config = getAIConfig(env);
  if (!config.apiKey) throw Error('尚未配置 AI API 密钥，当前可使用本地识别');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json'},
      body: JSON.stringify({
        model: kind === 'text' ? config.textModel : config.visionModel,
        messages, temperature: .1, max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.message || data.error?.message || `模型服务请求失败（${response.status}）`);
    return parseModelJSON(data.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}
