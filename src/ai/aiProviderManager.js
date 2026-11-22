const env = require('../config/env');
const groq = require('./providers/groqProvider');
const mistral = require('./providers/mistralProvider');
const nvidia = require('./providers/nvidiaProvider');
const google = require('./providers/googleProvider');
const openrouter = require('./providers/openrouterProvider');
const cohere = require('./providers/cohereProvider');
const ollama = require('./providers/ollamaProvider');
const fallbackEngine = require('./providers/fallbackEngine');

class AIProviderManager {
  constructor() {
    this.providers = {
      groq,
      mistral,
      nvidia,
      google,
      openrouter,
      cohere,
      ollama
    };

    // Priority order for auto cascade mode
    this.autoCascadeOrder = ['groq', 'google', 'mistral', 'nvidia', 'openrouter', 'cohere'];

    // Runtime state (can be changed dynamically without restarting server)
    this.activeProviderName = env.activeAiProvider || 'auto';
    this.customModels = {};
  }

  getKeyForProvider(name) {
    switch (name) {
      case 'groq':
        return env.groqApiKey;
      case 'mistral':
        return env.mistralApiKey;
      case 'nvidia':
        return env.nvidiaApiKey;
      case 'google':
        return env.geminiApiKey;
      case 'openrouter':
        return env.openrouterApiKey;
      case 'cohere':
        return env.cohereApiKey;
      default:
        return '';
    }
  }

  isProviderConfigured(name) {
    if (name === 'fallback') return true;
    if (name === 'ollama') return process.env.OLLAMA_ENABLED === 'true';
    return Boolean(this.getKeyForProvider(name));
  }

  getActiveProvider() {
    return {
      active: this.activeProviderName,
      effectiveProvider: this.resolveEffectiveProviderName()
    };
  }

  setActiveProvider(name, model = null) {
    const target = (name || '').toLowerCase();
    if (target !== 'auto' && target !== 'fallback' && !this.providers[target]) {
      throw new Error(`Unsupported AI provider: ${name}. Supported: auto, fallback, ${Object.keys(this.providers).join(', ')}`);
    }

    this.activeProviderName = target;
    if (model) {
      this.customModels[target] = model;
    }
    return this.getActiveProvider();
  }

  resolveEffectiveProviderName() {
    if (this.activeProviderName !== 'auto') {
      return this.activeProviderName;
    }

    // In auto mode, find the first provider with a configured API key
    for (const name of this.autoCascadeOrder) {
      if (this.isProviderConfigured(name)) {
        return name;
      }
    }
    return 'fallback';
  }

  listProviders() {
    const list = Object.entries(this.providers).map(([key, p]) => ({
      id: key,
      displayName: p.displayName,
      configured: this.isProviderConfigured(key),
      defaultModel: this.customModels[key] || p.defaultModel,
      supportedModels: p.supportedModels,
      isActive: this.activeProviderName === key || (this.activeProviderName === 'auto' && this.resolveEffectiveProviderName() === key)
    }));

    // Add Fallback
    list.push({
      id: 'fallback',
      displayName: 'Nexus Local Physics & Telemetry Engine (Deterministic)',
      configured: true,
      defaultModel: 'nexus-physics-v1',
      supportedModels: ['nexus-physics-v1'],
      isActive: this.activeProviderName === 'fallback' || (this.activeProviderName === 'auto' && this.resolveEffectiveProviderName() === 'fallback')
    });

    return {
      active_setting: this.activeProviderName,
      effective_provider: this.resolveEffectiveProviderName(),
      providers: list
    };
  }

  async testProvider(providerName, prompt = 'Hello! Respond with a one-sentence confirmation.') {
    const name = (providerName || '').toLowerCase();
    if (name === 'fallback') {
      return {
        provider: 'fallback',
        model: 'nexus-physics-v1',
        content: 'Nexus Physics & Telemetry Engine is online and operational.',
        latency_ms: 1
      };
    }

    const provider = this.providers[name];
    if (!provider) throw new Error(`Unknown provider: ${name}`);

    const apiKey = this.getKeyForProvider(name);
    if (!apiKey && name !== 'ollama') {
      throw new Error(`API key for ${provider.displayName} is not configured in .env`);
    }

    const messages = [{ role: 'user', content: prompt }];
    return await provider.chat(messages, {
      apiKey,
      model: this.customModels[name] || provider.defaultModel,
      timeoutMs: 12000
    });
  }

  async generateChat(messages, options = {}) {
    const preferred = options.provider || this.activeProviderName;

    // Build list of candidate providers to try in order
    let candidates = [];
    if (preferred === 'auto') {
      candidates = this.autoCascadeOrder.filter((n) => this.isProviderConfigured(n));
    } else if (preferred === 'fallback') {
      candidates = [];
    } else {
      candidates = [preferred];
      // If user specified provider fails, add the rest of configured ones as backup
      for (const n of this.autoCascadeOrder) {
        if (n !== preferred && this.isProviderConfigured(n)) candidates.push(n);
      }
    }

    // Try candidates
    const errors = [];
    for (const name of candidates) {
      const provider = this.providers[name];
      if (!provider) continue;

      const apiKey = this.getKeyForProvider(name);
      if (!apiKey && name !== 'ollama') continue;

      try {
        const result = await provider.chat(messages, {
          apiKey,
          model: options.model || this.customModels[name] || provider.defaultModel,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          jsonMode: options.jsonMode,
          timeoutMs: options.timeoutMs
        });
        return result;
      } catch (err) {
        errors.push({ provider: name, error: err.message });
        console.warn(`[AI Cascade] ${name} failed: ${err.message}. Trying next provider...`);
      }
    }

    // Ultimate fallback: deterministic rule engine
    const fallbackRes = fallbackEngine.answerCopilotChat(messages, options.telemetry || {});
    return {
      content: fallbackRes.reply,
      provider: 'fallback-rules',
      model: 'nexus-physics-v1',
      latency_ms: 1,
      cascade_errors: errors.length > 0 ? errors : undefined
    };
  }

  async generateJson(messages, options = {}) {
    const res = await this.generateChat(messages, { ...options, jsonMode: true });
    let text = res.content || '';

    // Clean markdown json markers if present
    text = text.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();

    try {
      const parsed = JSON.parse(text);
      return {
        data: parsed,
        provider: res.provider,
        model: res.model,
        latency_ms: res.latency_ms
      };
    } catch (parseErr) {
      // If JSON parse failed, extract first JSON block via regex
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return {
            data: JSON.parse(match[0]),
            provider: res.provider,
            model: res.model,
            latency_ms: res.latency_ms
          };
        } catch (e) {
          // ignore
        }
      }

      // Return fallback deterministic insights
      return {
        data: fallbackEngine.generateCoachingInsights(options.telemetry || {}),
        provider: 'fallback-rules',
        model: 'nexus-physics-v1',
        latency_ms: res.latency_ms,
        warning: 'Failed to parse JSON response from LLM; returned physics baseline'
      };
    }
  }
}

// Singleton instance
module.exports = new AIProviderManager();
