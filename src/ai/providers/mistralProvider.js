/**
 * Mistral AI Provider Adapter
 * High quality European open-weights models (Mistral Small, Open Mistral 7B)
 * Free API Tier: https://console.mistral.ai
 */

const DEFAULT_MODEL = 'mistral-small-latest';
const API_URL = 'https://api.mistral.ai/v1/chat/completions';

async function chat(messages, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('Mistral API Key is not configured');

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 1200
    };

    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

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
      const err = new Error(`Mistral API Error (${res.status}): ${errorText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const latencyMs = Date.now() - start;

    return {
      content,
      provider: 'mistral',
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
  name: 'mistral',
  displayName: 'Mistral AI (Mistral Small)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: ['mistral-small-latest', 'open-mistral-7b', 'mistral-large-latest'],
  chat
};
