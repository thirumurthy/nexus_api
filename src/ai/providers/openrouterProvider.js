/**
 * OpenRouter Provider Adapter
 * Multi-model gateway with access to top :free models
 * Free API: https://openrouter.ai
 */

const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function chat(messages, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('OpenRouter API Key is not configured');

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 25000;
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

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nexus-pulse-ev.app',
        'X-Title': 'Nexus Pulse EV API'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errorText = await res.text();
      const err = new Error(`OpenRouter API Error (${res.status}): ${errorText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const latencyMs = Date.now() - start;

    return {
      content,
      provider: 'openrouter',
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
  name: 'openrouter',
  displayName: 'OpenRouter (:free models)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: [
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-24b-instruct-2501:free',
    'google/gemini-2.0-flash-exp:free'
  ],
  chat
};
