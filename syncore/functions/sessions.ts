import { mutation, query, s, type MutationCtx } from "../_generated/server.js";

const nullableString = s.nullable(s.string());

const contextSnapshot = s.object({
  appName: s.string(),
  windowTitle: nullableString,
  selectedText: s.string(),
  permissionsGranted: s.boolean(),
  confidence: s.enum(["high", "partial", "low"] as const),
  capturedAt: s.string()
});

const insertionPlan = s.object({
  strategy: s.enum(["replace-selection", "insert-at-cursor"] as const),
  targetApp: s.string(),
  capability: s.enum(["automation", "clipboard"] as const)
});

const activationMode = s.enum(["push-to-talk", "toggle"] as const);

const nowMs = (): number => Date.now();
type MutationLikeCtx = MutationCtx;

const toSession = (doc: Record<string, unknown> | null) => {
  if (!doc) return null;
  const { _id, _creationTime, sessionId, createdAtMs, updatedAtMs, isActive, activeKey, ...rest } = doc;
  void _id;
  void _creationTime;
  void createdAtMs;
  void updatedAtMs;
  void isActive;
  void activeKey;
  return {
    ...rest,
    id: sessionId
  };
};

const getActiveDoc = async (ctx: MutationLikeCtx) =>
  ctx.db.query("dictationSessions").withIndex("by_active", (q) => q.eq("activeKey", "active")).first();

const requireActiveSession = async (
  ctx: MutationLikeCtx,
  sessionId: string,
  allowedStatuses: string[]
) => {
  const session = await getActiveDoc(ctx);
  if (!session || session.sessionId !== sessionId) {
    throw new Error("Active session does not match the requested session.");
  }
  if (!allowedStatuses.includes(session.status)) {
    throw new Error(`Invalid session transition from ${session.status}.`);
  }
  return session;
};

const deactivateExisting = async (ctx: MutationLikeCtx) => {
  const existing = await getActiveDoc(ctx);
  if (!existing) return;
  const now = new Date().toISOString();
  await ctx.db.patch("dictationSessions", existing._id, {
    isActive: false,
    activeKey: "inactive",
    status: "error",
    captureIntent: "none",
    finishedAt: now,
    errorMessage: existing.errorMessage ?? "Dictation was interrupted before it finished.",
    updatedAtMs: nowMs()
  });
};

export const active = query({
  args: {},
  handler: async (ctx) => toSession(await ctx.db
    .query("dictationSessions")
    .withIndex("by_active", (q) => q.eq("activeKey", "active"))
    .first() as unknown as Record<string, unknown> | null)
});

export const byId = query({
  args: { sessionId: s.string() },
  handler: async (ctx, args) => toSession(await ctx.db
    .query("dictationSessions")
    .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
    .first() as unknown as Record<string, unknown> | null)
});

export const recent = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("dictationSessions").withIndex("by_updated").order("desc").take(20);
    return sessions.map((session) => toSession(session as unknown as Record<string, unknown>));
  }
});

export const start = mutation({
  args: {
    sessionId: s.string(),
    activationMode,
    startedAt: s.string(),
    targetApp: s.string(),
    context: contextSnapshot,
    insertionPlan
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    await deactivateExisting(ctx);
    const timestamp = Date.parse(args.startedAt);
    const createdAtMs = Number.isFinite(timestamp) ? timestamp : nowMs();
    await ctx.db.insert("dictationSessions", {
      sessionId: args.sessionId,
      isActive: true,
      activeKey: "active",
      activationMode: args.activationMode,
      status: "arming",
      captureIntent: "start",
      startedAt: args.startedAt,
      finishedAt: null,
      processingStartedAt: null,
      targetApp: args.targetApp,
      context: args.context,
      insertionPlan: args.insertionPlan,
      errorMessage: null,
      noticeMessage: null,
      finalText: "",
      partialText: "",
      createdAt: args.startedAt,
      createdAtMs,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const updateContext = mutation({
  args: { sessionId: s.string(), targetApp: s.string(), context: contextSnapshot },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["arming", "listening", "processing", "streaming"]);
    await ctx.db.patch("dictationSessions", session._id, {
      targetApp: args.targetApp,
      context: args.context,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const markListening = mutation({
  args: { sessionId: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["arming"]);
    await ctx.db.patch("dictationSessions", session._id, {
      status: "listening",
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const markRecorderFailed = mutation({
  args: { sessionId: s.string(), status: s.enum(["error", "permission-required"] as const), errorMessage: s.string(), finishedAt: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["arming"]);
    await ctx.db.patch("dictationSessions", session._id, {
      isActive: false,
      activeKey: "inactive",
      status: args.status,
      captureIntent: "none",
      errorMessage: args.errorMessage,
      finishedAt: args.finishedAt,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const requestStop = mutation({
  args: { sessionId: s.string(), processingStartedAt: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["arming", "listening"]);
    await ctx.db.patch("dictationSessions", session._id, {
      status: "processing",
      captureIntent: "stop",
      processingStartedAt: args.processingStartedAt,
      noticeMessage: null,
      errorMessage: null,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const markProcessing = mutation({
  args: { sessionId: s.string(), processingStartedAt: s.string(), targetApp: s.string(), context: contextSnapshot, insertionPlan },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["listening", "processing"]);
    await ctx.db.patch("dictationSessions", session._id, {
      status: "processing",
      captureIntent: "none",
      processingStartedAt: args.processingStartedAt,
      targetApp: args.targetApp,
      context: args.context,
      insertionPlan: args.insertionPlan,
      noticeMessage: null,
      errorMessage: null,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const appendPartial = mutation({
  args: { sessionId: s.string(), partialText: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["processing", "streaming"]);
    await ctx.db.patch("dictationSessions", session._id, {
      status: "streaming",
      partialText: args.partialText,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const complete = mutation({
  args: { sessionId: s.string(), finishedAt: s.string(), finalText: s.string(), partialText: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["processing", "streaming"]);
    await ctx.db.patch("dictationSessions", session._id, {
      isActive: true,
      activeKey: "active",
      status: "completed",
      captureIntent: "none",
      finishedAt: args.finishedAt,
      finalText: args.finalText,
      partialText: args.partialText,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const fail = mutation({
  args: { sessionId: s.string(), finishedAt: s.string(), errorMessage: s.string(), partialText: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["arming", "listening", "processing", "streaming"]);
    await ctx.db.patch("dictationSessions", session._id, {
      isActive: true,
      activeKey: "active",
      status: "error",
      captureIntent: "none",
      finishedAt: args.finishedAt,
      errorMessage: args.errorMessage,
      partialText: args.partialText,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const notice = mutation({
  args: { sessionId: s.string(), activationMode, startedAt: s.string(), finishedAt: s.string(), targetApp: s.string(), context: contextSnapshot, insertionPlan, noticeMessage: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    await deactivateExisting(ctx);
    const timestamp = Date.parse(args.startedAt);
    await ctx.db.insert("dictationSessions", {
      sessionId: args.sessionId,
      isActive: true,
      activeKey: "active",
      activationMode: args.activationMode,
      status: "notice",
      captureIntent: "none",
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      processingStartedAt: null,
      targetApp: args.targetApp,
      context: args.context,
      insertionPlan: args.insertionPlan,
      errorMessage: null,
      noticeMessage: args.noticeMessage,
      finalText: "",
      partialText: "",
      createdAt: args.startedAt,
      createdAtMs: Number.isFinite(timestamp) ? timestamp : nowMs(),
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const cancel = mutation({
  args: { sessionId: s.string(), finishedAt: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const session = await requireActiveSession(ctx, args.sessionId, ["arming", "listening", "processing", "streaming"]);
    await ctx.db.patch("dictationSessions", session._id, {
      isActive: true,
      activeKey: "active",
      status: "cancelled",
      captureIntent: "none",
      finishedAt: args.finishedAt,
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const finalizeInterruptedActive = mutation({
  args: {},
  returns: s.null(),
  handler: async (ctx) => {
    const session = await getActiveDoc(ctx);
    if (!session) return null;
    if (["completed", "notice", "error", "permission-required", "cancelled"].includes(session.status)) {
      await ctx.db.patch("dictationSessions", session._id, {
        isActive: false,
        activeKey: "inactive",
        captureIntent: "none",
        updatedAtMs: nowMs()
      });
      return null;
    }
    const now = new Date().toISOString();
    await ctx.db.patch("dictationSessions", session._id, {
      isActive: false,
      activeKey: "inactive",
      status: "error",
      captureIntent: "none",
      finishedAt: now,
      errorMessage: "Dictation was interrupted before it finished.",
      updatedAtMs: nowMs()
    });
    return null;
  }
});

export const dismissCurrent = mutation({
  args: {},
  returns: s.null(),
  handler: async (ctx) => {
    const session = await getActiveDoc(ctx);
    if (!session) return null;
    if (!["completed", "notice", "error", "permission-required", "cancelled"].includes(session.status)) {
      return null;
    }
    await ctx.db.patch("dictationSessions", session._id, {
      isActive: false,
      activeKey: "inactive",
      captureIntent: "none",
      updatedAtMs: nowMs()
    });
    return null;
  }
});
