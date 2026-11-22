/**
 * NVIDIA NIM Provider Adapter
 * High performance inference with free developer credits
 * Free API: https://build.nvidia.com
 */

const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';
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
      max_tokens: options.maxTokens || 1200
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
  displayName: 'NVIDIA NIM (Llama 3.3 70B)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: [
    'meta/llama-3.3-70b-instruct',
    'mistralai/mistral-large-2-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct'
  ],
  chat
};
