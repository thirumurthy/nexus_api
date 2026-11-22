/**
 * Groq AI Provider Adapter
 * Ultra-fast inference with generous free tier (Llama 3.3 70B, Llama 3.1 8B, Mixtral)
 * Free API: https://console.groq.com
 */

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function chat(messages, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('Groq API Key is not configured');

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 15000;
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
      const err = new Error(`Groq API Error (${res.status}): ${errorText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const latencyMs = Date.now() - start;

    return {
      content,
      provider: 'groq',
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
  name: 'groq',
  displayName: 'Groq Cloud (Llama 3.3 70B)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  chat
};
