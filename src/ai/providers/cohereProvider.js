/**
 * Cohere Provider Adapter
 * API: https://cohere.com
 */

const DEFAULT_MODEL = 'command-r-08-2024';
const API_URL = 'https://api.cohere.com/v2/chat';

async function chat(messages, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('Cohere API Key is not configured');

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const formattedMessages = messages.map((m) => ({
      role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature: options.temperature ?? 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errorText = await res.text();
      const err = new Error(`Cohere API Error (${res.status}): ${errorText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.message?.content?.[0]?.text || '';

    return {
      content,
      provider: 'cohere',
      model,
      latency_ms: Date.now() - start
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

module.exports = {
  name: 'cohere',
  displayName: 'Cohere (Command R)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: ['command-r-08-2024', 'command-r-plus-08-2024'],
  chat
};
