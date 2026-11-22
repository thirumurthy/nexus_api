const aiProviderManager = require('../ai/aiProviderManager');
const aiCoachService = require('../ai/aiCoachService');
const Scooter = require('../models/Scooter');
const {
  copilotChatSchema,
  aiProviderSwitchSchema,
  aiTestSchema
} = require('../middleware/validate');
const { toDeviceKey } = require('../utils/hash');

async function resolve(req, res) {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const deviceKey = toDeviceKey(deviceId);
  const exists = await Scooter.exists({ deviceKey });
  if (!exists) {
    res.status(404).json({ status: 'error', message: 'Scooter not found. Sync once first.' });
    return null;
  }
  return { deviceId, deviceKey };
}

// GET /api/ai/providers  -> List all available AI providers, configuration status & active model
exports.listProviders = (req, res) => {
  try {
    const data = aiProviderManager.listProviders();
    res.json({
      status: 'success',
      ...data
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/ai/provider  -> Dynamically switch active AI provider (free switching anytime)
exports.setActiveProvider = (req, res) => {
  try {
    const { provider, model } = aiProviderSwitchSchema.parse(req.body);
    const result = aiProviderManager.setActiveProvider(provider, model);

    res.json({
      status: 'success',
      message: `Active AI provider switched to ${provider.toUpperCase()}`,
      active_setting: result.active,
      effective_provider: result.effectiveProvider
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
};

// POST /api/ai/test  -> Test connectivity & latency of any provider
exports.testProvider = async (req, res, next) => {
  try {
    const { provider, prompt } = aiTestSchema.parse(req.body);
    const result = await aiProviderManager.testProvider(provider, prompt);

    res.json({
      status: 'success',
      test_result: result
    });
  } catch (err) {
    res.status(err.status || 500).json({
      status: 'error',
      provider: req.body?.provider,
      message: err.message
    });
  }
};

// GET /api/scooter/:deviceId/ai-coach  -> Returns AI Dynamic Insights & Eco Score
exports.getAiCoach = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const insights = await aiCoachService.getCoachingInsights(ctx.deviceKey, ctx.deviceId, false);
    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      ai_coach: insights
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/scooter/:deviceId/ai-coach/refresh  -> Forces fresh AI coaching generation
exports.refreshAiCoach = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const insights = await aiCoachService.getCoachingInsights(ctx.deviceKey, ctx.deviceId, true);
    res.json({
      status: 'success',
      device_id: ctx.deviceId,
      message: 'AI Coaching insights refreshed with fresh telemetry',
      ai_coach: insights
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/scooter/:deviceId/ai-copilot/chat  -> Conversational Nexus Neural Copilot
exports.copilotChat = async (req, res, next) => {
  try {
    const ctx = await resolve(req, res);
    if (!ctx) return;

    const { message, history } = copilotChatSchema.parse(req.body);
    const result = await aiCoachService.chatWithCopilot(ctx.deviceKey, ctx.deviceId, message, history || []);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/chat  -> Generic or device-agnostic copilot endpoint
exports.genericChat = async (req, res, next) => {
  try {
    const { message, history } = copilotChatSchema.parse(req.body);
    const messages = [
      {
        role: 'system',
        content: 'You are Nexus Neural Copilot, the AI automotive assistant for Ampere Nexus electric scooters. Help riders with EV range, battery health, regenerative braking, and smart riding habits.'
      },
      ...(history || []).slice(-6),
      { role: 'user', content: message }
    ];

    const result = await aiProviderManager.generateChat(messages, {
      temperature: 0.6
    });

    res.json({
      status: 'success',
      reply: result.content,
      provider: result.provider,
      model: result.model,
      latency_ms: result.latency_ms
    });
  } catch (err) {
    next(err);
  }
};
