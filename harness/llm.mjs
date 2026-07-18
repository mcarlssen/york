const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function extractContent(data) {
  return (
    data?.choices?.[0]?.message?.content ??
    data?.content ??
    null
  );
}

function estimateTokens(system, user, content) {
  const len =
    String(system ?? "").length +
    String(user ?? "").length +
    String(content ?? "").length;
  return Math.ceil(len / 4);
}

async function readResponse(r, transport) {
  if (r.status === 429) {
    return { content: null, status: "rate_limit", transport, usage: null };
  }
  if (!r.ok) {
    return { content: null, status: "error", transport, usage: null };
  }
  const data = await r.json().catch(() => ({}));
  const content = extractContent(data);
  const total =
    typeof data?.usage?.total_tokens === "number"
      ? data.usage.total_tokens
      : null;
  return {
    content,
    status: content ? "ok" : "empty",
    transport,
    usage: total != null ? { total_tokens: total } : null,
  };
}

export function createLlmClient(config) {
  const model = config.PLAYER_MODEL;
  const transport = config.API_BASE ? "proxy" : "direct";
  const usage = { totalTokens: 0 };
  const endpointUrl = config.LLM_ENDPOINT_URL || DEFAULT_ENDPOINT;

  async function complete({ system, user, maxTokens }) {
    try {
      let result;
      if (config.API_BASE) {
        const r = await fetch(`${config.API_BASE}/llm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system, user, maxTokens }),
        });
        result = await readResponse(r, "proxy");
      } else {
        const r = await fetch(endpointUrl, {
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
        result = await readResponse(r, "direct");
      }
      const add =
        result.usage?.total_tokens ??
        estimateTokens(system, user, result.content);
      usage.totalTokens += add;
      return result;
    } catch {
      usage.totalTokens += estimateTokens(system, user, null);
      return { content: null, status: "transport_fail", transport };
    }
  }

  function tokensUsed() {
    return usage.totalTokens;
  }

  return { complete, model, transport, usage, tokensUsed };
}
