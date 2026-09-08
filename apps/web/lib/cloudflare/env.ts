/** Default Workers AI model — mirrors AusCPI naming/pattern (not coupled). */
export const DEFAULT_CHAT_MODEL = "@cf/zai-org/glm-4.7-flash";

export function getCloudflareAccountId(): string | undefined {
  const v = process.env.CLOUDFLARE_ACCOUNT_ID;
  return v && v.trim() ? v.trim() : undefined;
}

export function getCloudflareApiToken(): string | undefined {
  const v = process.env.CLOUDFLARE_API_TOKEN;
  return v && v.trim() ? v.trim() : undefined;
}

export function getChatModel(): string {
  const v = process.env.CHAT_MODEL;
  return v && v.trim() ? v.trim() : DEFAULT_CHAT_MODEL;
}

/** True when Workers AI credentials are present for chat. */
export function hasCloudflareChatEnv(): boolean {
  return Boolean(getCloudflareAccountId() && getCloudflareApiToken());
}
