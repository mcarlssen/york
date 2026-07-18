// Shared Upstash Redis client for API + harness.

export function redisRestCreds(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "";
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "";
  return url && token ? { url, token } : null;
}

let redis = null;

/** Returns Redis client, or false when unavailable. */
export async function getRedis(env = process.env) {
  if (redis !== null) return redis;
  const creds = redisRestCreds(env);
  if (creds) {
    try {
      const mod = await import("@upstash/redis");
      if (mod && mod.Redis) redis = new mod.Redis(creds);
      else redis = false;
    } catch {
      redis = false;
    }
  } else {
    redis = false;
  }
  return redis;
}

/** Test helper: clear cached client so the next getRedis re-reads env. */
export function resetRedisCache() {
  redis = null;
}
