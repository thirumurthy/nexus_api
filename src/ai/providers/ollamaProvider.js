/**
 * Ollama Local Provider Adapter
 * 100% offline, zero-cost inference via local Ollama instance
 * Default URL: http://localhost:11434
 */

const DEFAULT_MODEL = 'llama3.2';

async function chat(messages, options = {}) {
  const baseUrl = options.baseUrl || 'http://localhost:11434';
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errorText = await res.text();
      const err = new Error(`Ollama Error (${res.status}): ${errorText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      provider: 'ollama',
      model,
      latency_ms: Date.now() - start
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

module.exports = {
  name: 'ollama',
  displayName: 'Ollama (Local Offline)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: ['llama3.2', 'mistral', 'qwen2.5'],
  chat
};
