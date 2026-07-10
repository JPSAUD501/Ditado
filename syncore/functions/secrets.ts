import { action, s, type ActionCtx } from "../_generated/server.js";

type ApiKeyVault = {
  status(): Promise<{ present: boolean }>;
  set(apiKey: string): Promise<{ present: boolean }>;
};

const isApiKeyVault = (value: unknown): value is ApiKeyVault => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "status" in value &&
    typeof value.status === "function" &&
    "set" in value &&
    typeof value.set === "function"
  );
};

const requireVault = (ctx: ActionCtx): ApiKeyVault => {
  const vault = ctx.capabilities?.apiKeyVault;
  if (!isApiKeyVault(vault)) {
    throw new Error("The API key vault capability is unavailable.");
  }
  return vault;
};

export const status = action({
  args: {},
  handler: async (ctx) => requireVault(ctx).status()
});

export const set = action({
  args: { apiKey: s.string() },
  handler: async (ctx, args) => requireVault(ctx).set(args.apiKey)
});
