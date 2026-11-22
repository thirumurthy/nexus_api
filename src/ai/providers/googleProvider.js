/**
 * Google AI (Gemini) Provider Adapter
 * Generous free tier via Google AI Studio (Gemini 2.0 Flash / 1.5 Flash)
 * Free API: https://aistudio.google.com
 */

const DEFAULT_MODEL = 'gemini-2.0-flash';
const OPENAI_COMPAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const NATIVE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

async function chat(messages, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('Google AI / Gemini API Key is not configured');

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 25000;
  const start = Date.now();

  // Try standard OpenAI-compatible format first
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 1200
    };

    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(OPENAI_COMPAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      return {
        content,
        provider: 'google',
        model,
        latency_ms: Date.now() - start,
        usage: data.usage
      };
    }
  } catch (err) {
    // If OpenAI compatibility failed, try native endpoint
  }

  // Fallback to Native Gemini API
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const geminiContents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const systemInstruction = messages.find((m) => m.role === 'system');

    const nativeBody = {
      contents: geminiContents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens || 1200
      }
    };

    if (systemInstruction) {
      nativeBody.systemInstruction = {
        parts: [{ text: systemInstruction.content }]
      };
    }

    if (options.jsonMode) {
      nativeBody.generationConfig.responseMimeType = 'application/json';
    }

    const nativeUrl = `${NATIVE_BASE_URL}/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(nativeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nativeBody),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errorText = await res.text();
      const err = new Error(`Google AI API Error (${res.status}): ${errorText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content,
      provider: 'google',
      model,
      latency_ms: Date.now() - start
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

module.exports = {
  name: 'google',
  displayName: 'Google AI (Gemini 2.0 Flash)',
  defaultModel: DEFAULT_MODEL,
  supportedModels: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  chat
};
