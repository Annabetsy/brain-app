// claude.js — Claude API wrapper for room scan and quick ask

const Claude = {
  _baseUrl: 'https://api.anthropic.com/v1',

  async _request(messages, { maxTokens = 1024, system = null } = {}) {
    const config = Storage.getConfig();
    if (!config.claudeKey) throw new Error('Claude API key not configured');

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;

    const resp = await fetch(`${this._baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.claudeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API error: ${resp.status}`);
    }

    const data = await resp.json();
    return data.content[0].text;
  },

  // Analyze a room photo and suggest tasks
  async roomScan(imageBase64, mimeType = 'image/jpeg') {
    const system = `You are helping someone plan their weekend cleaning and organizing. When shown a photo of a room, suggest concrete, actionable tasks with time estimates. Format each task as a markdown checklist item: "- [ ] Task description (~Xmin)". Be specific (not "clean kitchen" but "clear countertops and load dishwasher"). Keep suggestions practical — focus on what's visible and achievable in a weekend. Limit to 5-8 tasks max.`;

    const messages = [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: imageBase64,
          },
        },
        {
          type: 'text',
          text: 'What tasks do you see in this room? Give me a weekend-friendly checklist with time estimates.',
        },
      ],
    }];

    return this._request(messages, { maxTokens: 1024, system });
  },

  // General ask — send text and get a response
  async ask(userMessage, context = '') {
    const system = `You are a helpful, warm assistant for a busy working mom and researcher. You help with task planning, meal planning, prioritization, and general life admin. Keep responses concise and actionable. When suggesting tasks, format them as markdown checklist items: "- [ ] Task (~time estimate)". Be casual and supportive, never judgmental.${context ? '\n\nContext:\n' + context : ''}`;

    const messages = [{
      role: 'user',
      content: userMessage,
    }];

    return this._request(messages, { maxTokens: 1024, system });
  },

  // Test the connection
  async testConnection() {
    return this.ask('Say "Connected!" and nothing else.');
  },
};
