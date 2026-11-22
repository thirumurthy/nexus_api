/**
 * NVIDIA NIM Provider Adapter
 * High performance inference with free developer credits
 * Free API: https://build.nvidia.com
 */

const DEFAULT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function chat(messages, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('NVIDIA API Key is not configured');

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens || 1200,
      chat_template_kwargs: { enable_thinking: false }
    };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errorText = await res.text();
      const err = new Error(`NVIDIA NIM API Error (${res.status}): ${errorText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const latencyMs = Date.now() - start;

    return {
      content,
      provider: 'nvidia',
      model,
      latency_ms: latencyMs,
      usage: data.usage
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

module.exports = {
  name: 'nvidia',
  displayName: 'NVIDIA NIM (Nemotron 3.5 Lightning 30B)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: [
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nemotron-3-nano-30b-a3b'
  ],
  chat
};
