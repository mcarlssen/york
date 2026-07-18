const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function extractContent(data) {
  return (
    data?.choices?.[0]?.message?.content ??
    data?.content ??
    null
  );
}

async function readResponse(r, transport) {
  if (r.status === 429) {
    return { content: null, status: "rate_limit", transport };
  }
  if (!r.ok) {
    return { content: null, status: "error", transport };
  }
  const data = await r.json().catch(() => ({}));
  const content = extractContent(data);
  return { content, status: content ? "ok" : "empty", transport };
}

export function createLlmClient(config) {
  const model = config.PLAYER_MODEL;
  const transport = config.API_BASE ? "proxy" : "direct";

  async function complete({ system, user, maxTokens }) {
    try {
      if (config.API_BASE) {
        const r = await fetch(`${config.API_BASE}/llm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system, user, maxTokens }),
        });
        return readResponse(r, "proxy");
      }

      const r = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens || 200,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      return readResponse(r, "direct");
    } catch {
      return { content: null, status: "transport_fail", transport };
    }
  }

  return { complete, model, transport };
}
