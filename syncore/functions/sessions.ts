import {
  mutation,
  query,
  s,
  type Doc,
  type DocPatch,
  type MutationCtx
} from "../_generated/server.js";
import {
  activationMode,
  contextSnapshot,
  insertionPlan,
  insertionStreamingMode,
  terminalAudit
} from "../model.js";

const terminalStatuses = [
  "completed",
  "notice",
  "error",
  "permission-required",
  "cancelled"
] as const;

const isTerminalStatus = (
  status: Doc<"dictationSessions">["status"]
): status is (typeof terminalStatuses)[number] =>
  terminalStatuses.some((terminalStatus) => terminalStatus === status);

const nowMs = (): number => Date.now();

const emptyTiming = () => ({
  sessionStartedMs: 0,
  contextPreviewStartedMs: null,
  contextPreviewCompletedMs: null,
  contextRefreshStartedMs: null,
  contextRefreshCompletedMs: null,
  submissionStartedMs: null,
  stopRequestedMs: null,
  microphoneRequestStartedMs: null,
  microphoneRequestCompletedMs: null,
  recordingStartedMs: null,
  recordingEndedMs: null,
  recorderStopStartedMs: null,
  mediaRecorderStopCompletedMs: null,
  audioPreparationStartedMs: null,
  audioPreparationEndedMs: null,
  processingStartedMs: null,
  llmRequestStartedMs: null,
  llmResponseHeadersMs: null,
  firstTokenMs: null,
  llmCompletedMs: null,
  insertionStartedMs: null,
  insertionCompletedMs: null,
  sessionFinishedMs: null
});

const emptyAudio = () => ({
  durationMs: 0,
  mimeType: null,
  bytes: 0,
  speechDetected: false,
  peakAmplitude: 0,
  rmsAmplitude: 0,
  languageHint: null,
  stopReason: "unknown" as const,
  maxDurationReached: false
});

const emptyInsertion = (
  plan: { strategy: "replace-selection" | "insert-at-cursor"; targetApp: string },
  requestedMode: "letter-by-letter" | "all-at-once"
) => ({
  strategy: plan.strategy,
  requestedMode,
  effectiveMode: requestedMode,
  method: "clipboard-all-at-once" as const,
  fallbackUsed: false,
  targetApp: plan.targetApp,
  writtenCharacterCount: null
});

const getActive = async (ctx: MutationCtx) =>
  ctx.db
    .query("dictationSessions")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .first();

const requireActive = async (
  ctx: MutationCtx,
  sessionId: string,
  allowedStatuses: readonly Doc<"dictationSessions">["status"][]
) => {
  const session = await getActive(ctx);
  if (!session || session.sessionId !== sessionId) {
    throw new Error("Active session does not match the requested session.");
  }
  if (!allowedStatuses.includes(session.status)) {
    throw new Error(`Invalid session transition from ${session.status}.`);
  }
  return session;
};

const patchSession = async (
  ctx: MutationCtx,
  session: Doc<"dictationSessions">,
  patch: DocPatch<"dictationSessions">
) => {
  await ctx.db.patch("dictationSessions", session._id, {
    ...patch,
    updatedAtMs: nowMs()
  });
  const updated = await ctx.db.get("dictationSessions", session._id);
  if (!updated) {
    throw new Error("Session disappeared after update.");
  }
  return updated;
};

const deactivateExisting = async (ctx: MutationCtx): Promise<void> => {
  const existing = await getActive(ctx);
  if (!existing) {
    return;
  }
  if (isTerminalStatus(existing.status)) {
    await patchSession(ctx, existing, { isActive: false });
    return;
  }

  const finishedAt = new Date().toISOString();
  await patchSession(ctx, existing, {
    isActive: false,
    status: "error",
    captureIntent: "none",
    finishedAt,
    errorMessage: "Dictation was interrupted before it finished.",
    historyStatus: "failed",
    historyError: "Session was replaced before history could be saved."
  });
};

export const active = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("dictationSessions")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first()
});

export const byId = query({
  args: { sessionId: s.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("dictationSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first()
});

export const recent = query({
  args: { limit: s.optional(s.number()) },
  handler: async (ctx, args) =>
    ctx.db
      .query("dictationSessions")
      .withIndex("by_updated")
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 20, 1), 100))
});

export const start = mutation({
  args: {
    sessionId: s.string(),
    activationMode,
    startedAt: s.string(),
    targetApp: s.string(),
    context: contextSnapshot,
    insertionPlan,
    modelId: s.string(),
    requestedMode: insertionStreamingMode
  },
  handler: async (ctx, args) => {
    await deactivateExisting(ctx);
    const parsedStartedAt = Date.parse(args.startedAt);
    const createdAtMs = Number.isFinite(parsedStartedAt)
      ? parsedStartedAt
      : nowMs();
    const id = await ctx.db.insert("dictationSessions", {
      sessionId: args.sessionId,
      isActive: true,
      activationMode: args.activationMode,
      status: "arming",
      captureIntent: "start",
      startedAt: args.startedAt,
      finishedAt: null,
      processingStartedAt: null,
      targetApp: args.targetApp,
      context: args.context,
      insertionPlan: args.insertionPlan,
      partialText: "",
      finalText: "",
      errorMessage: null,
      noticeMessage: null,
      timing: emptyTiming(),
      audio: emptyAudio(),
      llm: {
        provider: "openrouter",
        modelId: args.modelId,
        finishReason: null,
        usedContext: false
      },
      insertion: emptyInsertion(args.insertionPlan, args.requestedMode),
      historyStatus: "pending",
      historyError: null,
      createdAtMs,
      updatedAtMs: nowMs()
    });
    const created = await ctx.db.get("dictationSessions", id);
    if (!created) {
      throw new Error("Session initialization did not create a document.");
    }
    return created;
  }
});

export const updateContext = mutation({
  args: {
    sessionId: s.string(),
    targetApp: s.string(),
    context: contextSnapshot
  },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, [
      "arming",
      "listening",
      "processing",
      "streaming"
    ]);
    return patchSession(ctx, session, {
      targetApp: args.targetApp,
      context: args.context
    });
  }
});

export const markListening = mutation({
  args: { sessionId: s.string() },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, ["arming"]);
    return patchSession(ctx, session, {
      status: "listening",
      captureIntent: "none"
    });
  }
});

export const markRecorderFailed = mutation({
  args: {
    sessionId: s.string(),
    status: s.enum(["error", "permission-required"] as const),
    errorMessage: s.string(),
    finishedAt: s.string()
  },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, ["arming"]);
    return patchSession(ctx, session, {
      status: args.status,
      captureIntent: "none",
      finishedAt: args.finishedAt,
      errorMessage: args.errorMessage,
      historyStatus: "not-required"
    });
  }
});

export const requestStop = mutation({
  args: { sessionId: s.string(), processingStartedAt: s.string() },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, [
      "arming",
      "listening"
    ]);
    return patchSession(ctx, session, {
      status: "processing",
      captureIntent: "stop",
      processingStartedAt: args.processingStartedAt,
      noticeMessage: null,
      errorMessage: null
    });
  }
});

export const markProcessing = mutation({
  args: {
    sessionId: s.string(),
    processingStartedAt: s.string(),
    targetApp: s.string(),
    context: contextSnapshot,
    insertionPlan
  },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, [
      "listening",
      "processing"
    ]);
    return patchSession(ctx, session, {
      status: "processing",
      captureIntent: "none",
      processingStartedAt: args.processingStartedAt,
      targetApp: args.targetApp,
      context: args.context,
      insertionPlan: args.insertionPlan,
      noticeMessage: null,
      errorMessage: null
    });
  }
});

export const appendPartial = mutation({
  args: { sessionId: s.string(), partialText: s.string() },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, [
      "processing",
      "streaming"
    ]);
    return patchSession(ctx, session, {
      status: "streaming",
      partialText: args.partialText
    });
  }
});

export const complete = mutation({
  args: {
    sessionId: s.string(),
    finishedAt: s.string(),
    finalText: s.string(),
    partialText: s.string(),
    audit: terminalAudit
  },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, [
      "processing",
      "streaming"
    ]);
    return patchSession(ctx, session, {
      status: "completed",
      captureIntent: "none",
      finishedAt: args.finishedAt,
      finalText: args.finalText,
      partialText: args.partialText,
      timing: args.audit.timing,
      audio: args.audit.audio,
      llm: args.audit.llm,
      insertion: args.audit.insertion,
      historyStatus: "pending",
      historyError: null
    });
  }
});

export const fail = mutation({
  args: {
    sessionId: s.string(),
    finishedAt: s.string(),
    errorMessage: s.string(),
    partialText: s.string(),
    audit: terminalAudit
  },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, [
      "arming",
      "listening",
      "processing",
      "streaming"
    ]);
    return patchSession(ctx, session, {
      status: "error",
      captureIntent: "none",
      finishedAt: args.finishedAt,
      errorMessage: args.errorMessage,
      partialText: args.partialText,
      timing: args.audit.timing,
      audio: args.audit.audio,
      llm: args.audit.llm,
      insertion: args.audit.insertion,
      historyStatus: "pending",
      historyError: null
    });
  }
});

export const notice = mutation({
  args: {
    sessionId: s.string(),
    activationMode,
    startedAt: s.string(),
    finishedAt: s.string(),
    targetApp: s.string(),
    context: contextSnapshot,
    insertionPlan,
    noticeMessage: s.string(),
    modelId: s.string(),
    requestedMode: insertionStreamingMode
  },
  handler: async (ctx, args) => {
    await deactivateExisting(ctx);
    const parsedStartedAt = Date.parse(args.startedAt);
    const id = await ctx.db.insert("dictationSessions", {
      sessionId: args.sessionId,
      isActive: true,
      activationMode: args.activationMode,
      status: "notice",
      captureIntent: "none",
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      processingStartedAt: null,
      targetApp: args.targetApp,
      context: args.context,
      insertionPlan: args.insertionPlan,
      partialText: "",
      finalText: "",
      errorMessage: null,
      noticeMessage: args.noticeMessage,
      timing: emptyTiming(),
      audio: emptyAudio(),
      llm: {
        provider: "openrouter",
        modelId: args.modelId,
        finishReason: null,
        usedContext: false
      },
      insertion: emptyInsertion(args.insertionPlan, args.requestedMode),
      historyStatus: "not-required",
      historyError: null,
      createdAtMs: Number.isFinite(parsedStartedAt)
        ? parsedStartedAt
        : nowMs(),
      updatedAtMs: nowMs()
    });
    const created = await ctx.db.get("dictationSessions", id);
    if (!created) {
      throw new Error("Notice session was not created.");
    }
    return created;
  }
});

export const cancel = mutation({
  args: { sessionId: s.string(), finishedAt: s.string() },
  handler: async (ctx, args) => {
    const session = await requireActive(ctx, args.sessionId, [
      "arming",
      "listening",
      "processing",
      "streaming"
    ]);
    return patchSession(ctx, session, {
      status: "cancelled",
      captureIntent: "none",
      finishedAt: args.finishedAt,
      historyStatus: "not-required"
    });
  }
});

export const finalizeInterruptedActive = mutation({
  args: {},
  handler: async (ctx) => {
    const session = await getActive(ctx);
    if (!session) {
      return null;
    }
    if (isTerminalStatus(session.status)) {
      return patchSession(ctx, session, { isActive: false });
    }

    return patchSession(ctx, session, {
      isActive: false,
      status: "error",
      captureIntent: "none",
      finishedAt: new Date().toISOString(),
      errorMessage: "Dictation was interrupted before it finished.",
      historyStatus: "failed",
      historyError: "The app stopped before history could be saved."
    });
  }
});

export const dismissCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const session = await getActive(ctx);
    if (!session || !isTerminalStatus(session.status)) {
      return session;
    }
    return patchSession(ctx, session, { isActive: false });
  }
});
