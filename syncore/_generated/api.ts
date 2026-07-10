/**
 * Generated `api` utility for referencing Syncore functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import { createFunctionReferenceFor } from "syncorejs";
import type { FunctionReferenceFor } from "syncorejs";
export { components } from "./components.js";

import type { appendWithAudio as history__appendWithAudio } from "../functions/history.js";
import type { audio as history__audio } from "../functions/history.js";
import type { clear as history__clear } from "../functions/history.js";
import type { page as history__page } from "../functions/history.js";
import type { remove as history__remove } from "../functions/history.js";
import type { search as history__search } from "../functions/history.js";
import type { stats as history__stats } from "../functions/history.js";
import type { pruneHistory as maintenance__pruneHistory } from "../functions/maintenance.js";
import type { set as secrets__set } from "../functions/secrets.js";
import type { status as secrets__status } from "../functions/secrets.js";
import type { active as sessions__active } from "../functions/sessions.js";
import type { appendPartial as sessions__appendPartial } from "../functions/sessions.js";
import type { byId as sessions__byId } from "../functions/sessions.js";
import type { cancel as sessions__cancel } from "../functions/sessions.js";
import type { complete as sessions__complete } from "../functions/sessions.js";
import type { dismissCurrent as sessions__dismissCurrent } from "../functions/sessions.js";
import type { fail as sessions__fail } from "../functions/sessions.js";
import type { finalizeInterruptedActive as sessions__finalizeInterruptedActive } from "../functions/sessions.js";
import type { markListening as sessions__markListening } from "../functions/sessions.js";
import type { markProcessing as sessions__markProcessing } from "../functions/sessions.js";
import type { markRecorderFailed as sessions__markRecorderFailed } from "../functions/sessions.js";
import type { notice as sessions__notice } from "../functions/sessions.js";
import type { recent as sessions__recent } from "../functions/sessions.js";
import type { requestStop as sessions__requestStop } from "../functions/sessions.js";
import type { start as sessions__start } from "../functions/sessions.js";
import type { updateContext as sessions__updateContext } from "../functions/sessions.js";
import type { ensure as settings__ensure } from "../functions/settings.js";
import type { get as settings__get } from "../functions/settings.js";
import type { update as settings__update } from "../functions/settings.js";

/**
 * Type-safe references to functions exported from `syncore/functions/history.ts`.
 */
export interface SyncoreApi__history {
  /**
   * Reference to the public Syncore mutation `history/appendWithAudio`.
   */
  readonly appendWithAudio: FunctionReferenceFor<typeof history__appendWithAudio>;
  /**
   * Reference to the public Syncore query `history/audio`.
   */
  readonly audio: FunctionReferenceFor<typeof history__audio>;
  /**
   * Reference to the public Syncore mutation `history/clear`.
   */
  readonly clear: FunctionReferenceFor<typeof history__clear>;
  /**
   * Reference to the public Syncore query `history/page`.
   */
  readonly page: FunctionReferenceFor<typeof history__page>;
  /**
   * Reference to the public Syncore mutation `history/remove`.
   */
  readonly remove: FunctionReferenceFor<typeof history__remove>;
  /**
   * Reference to the public Syncore query `history/search`.
   */
  readonly search: FunctionReferenceFor<typeof history__search>;
  /**
   * Reference to the public Syncore query `history/stats`.
   */
  readonly stats: FunctionReferenceFor<typeof history__stats>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/maintenance.ts`.
 */
export interface SyncoreApi__maintenance {
  /**
   * Reference to the public Syncore mutation `maintenance/pruneHistory`.
   */
  readonly pruneHistory: FunctionReferenceFor<typeof maintenance__pruneHistory>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/secrets.ts`.
 */
export interface SyncoreApi__secrets {
  /**
   * Reference to the public Syncore action `secrets/set`.
   */
  readonly set: FunctionReferenceFor<typeof secrets__set>;
  /**
   * Reference to the public Syncore action `secrets/status`.
   */
  readonly status: FunctionReferenceFor<typeof secrets__status>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/sessions.ts`.
 */
export interface SyncoreApi__sessions {
  /**
   * Reference to the public Syncore query `sessions/active`.
   */
  readonly active: FunctionReferenceFor<typeof sessions__active>;
  /**
   * Reference to the public Syncore mutation `sessions/appendPartial`.
   */
  readonly appendPartial: FunctionReferenceFor<typeof sessions__appendPartial>;
  /**
   * Reference to the public Syncore query `sessions/byId`.
   */
  readonly byId: FunctionReferenceFor<typeof sessions__byId>;
  /**
   * Reference to the public Syncore mutation `sessions/cancel`.
   */
  readonly cancel: FunctionReferenceFor<typeof sessions__cancel>;
  /**
   * Reference to the public Syncore mutation `sessions/complete`.
   */
  readonly complete: FunctionReferenceFor<typeof sessions__complete>;
  /**
   * Reference to the public Syncore mutation `sessions/dismissCurrent`.
   */
  readonly dismissCurrent: FunctionReferenceFor<typeof sessions__dismissCurrent>;
  /**
   * Reference to the public Syncore mutation `sessions/fail`.
   */
  readonly fail: FunctionReferenceFor<typeof sessions__fail>;
  /**
   * Reference to the public Syncore mutation `sessions/finalizeInterruptedActive`.
   */
  readonly finalizeInterruptedActive: FunctionReferenceFor<typeof sessions__finalizeInterruptedActive>;
  /**
   * Reference to the public Syncore mutation `sessions/markListening`.
   */
  readonly markListening: FunctionReferenceFor<typeof sessions__markListening>;
  /**
   * Reference to the public Syncore mutation `sessions/markProcessing`.
   */
  readonly markProcessing: FunctionReferenceFor<typeof sessions__markProcessing>;
  /**
   * Reference to the public Syncore mutation `sessions/markRecorderFailed`.
   */
  readonly markRecorderFailed: FunctionReferenceFor<typeof sessions__markRecorderFailed>;
  /**
   * Reference to the public Syncore mutation `sessions/notice`.
   */
  readonly notice: FunctionReferenceFor<typeof sessions__notice>;
  /**
   * Reference to the public Syncore query `sessions/recent`.
   */
  readonly recent: FunctionReferenceFor<typeof sessions__recent>;
  /**
   * Reference to the public Syncore mutation `sessions/requestStop`.
   */
  readonly requestStop: FunctionReferenceFor<typeof sessions__requestStop>;
  /**
   * Reference to the public Syncore mutation `sessions/start`.
   */
  readonly start: FunctionReferenceFor<typeof sessions__start>;
  /**
   * Reference to the public Syncore mutation `sessions/updateContext`.
   */
  readonly updateContext: FunctionReferenceFor<typeof sessions__updateContext>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/settings.ts`.
 */
export interface SyncoreApi__settings {
  /**
   * Reference to the public Syncore mutation `settings/ensure`.
   */
  readonly ensure: FunctionReferenceFor<typeof settings__ensure>;
  /**
   * Reference to the public Syncore query `settings/get`.
   */
  readonly get: FunctionReferenceFor<typeof settings__get>;
  /**
   * Reference to the public Syncore mutation `settings/update`.
   */
  readonly update: FunctionReferenceFor<typeof settings__update>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/history.ts`.
   */
  readonly history: SyncoreApi__history;
  /**
   * Functions exported from `syncore/functions/maintenance.ts`.
   */
  readonly maintenance: SyncoreApi__maintenance;
  /**
   * Functions exported from `syncore/functions/secrets.ts`.
   */
  readonly secrets: SyncoreApi__secrets;
  /**
   * Functions exported from `syncore/functions/sessions.ts`.
   */
  readonly sessions: SyncoreApi__sessions;
  /**
   * Functions exported from `syncore/functions/settings.ts`.
   */
  readonly settings: SyncoreApi__settings;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { history: { appendWithAudio: createFunctionReferenceFor<typeof history__appendWithAudio>("mutation", "history/appendWithAudio"), audio: createFunctionReferenceFor<typeof history__audio>("query", "history/audio"), clear: createFunctionReferenceFor<typeof history__clear>("mutation", "history/clear"), page: createFunctionReferenceFor<typeof history__page>("query", "history/page"), remove: createFunctionReferenceFor<typeof history__remove>("mutation", "history/remove"), search: createFunctionReferenceFor<typeof history__search>("query", "history/search"), stats: createFunctionReferenceFor<typeof history__stats>("query", "history/stats") }, maintenance: { pruneHistory: createFunctionReferenceFor<typeof maintenance__pruneHistory>("mutation", "maintenance/pruneHistory") }, secrets: { set: createFunctionReferenceFor<typeof secrets__set>("action", "secrets/set"), status: createFunctionReferenceFor<typeof secrets__status>("action", "secrets/status") }, sessions: { active: createFunctionReferenceFor<typeof sessions__active>("query", "sessions/active"), appendPartial: createFunctionReferenceFor<typeof sessions__appendPartial>("mutation", "sessions/appendPartial"), byId: createFunctionReferenceFor<typeof sessions__byId>("query", "sessions/byId"), cancel: createFunctionReferenceFor<typeof sessions__cancel>("mutation", "sessions/cancel"), complete: createFunctionReferenceFor<typeof sessions__complete>("mutation", "sessions/complete"), dismissCurrent: createFunctionReferenceFor<typeof sessions__dismissCurrent>("mutation", "sessions/dismissCurrent"), fail: createFunctionReferenceFor<typeof sessions__fail>("mutation", "sessions/fail"), finalizeInterruptedActive: createFunctionReferenceFor<typeof sessions__finalizeInterruptedActive>("mutation", "sessions/finalizeInterruptedActive"), markListening: createFunctionReferenceFor<typeof sessions__markListening>("mutation", "sessions/markListening"), markProcessing: createFunctionReferenceFor<typeof sessions__markProcessing>("mutation", "sessions/markProcessing"), markRecorderFailed: createFunctionReferenceFor<typeof sessions__markRecorderFailed>("mutation", "sessions/markRecorderFailed"), notice: createFunctionReferenceFor<typeof sessions__notice>("mutation", "sessions/notice"), recent: createFunctionReferenceFor<typeof sessions__recent>("query", "sessions/recent"), requestStop: createFunctionReferenceFor<typeof sessions__requestStop>("mutation", "sessions/requestStop"), start: createFunctionReferenceFor<typeof sessions__start>("mutation", "sessions/start"), updateContext: createFunctionReferenceFor<typeof sessions__updateContext>("mutation", "sessions/updateContext") }, settings: { ensure: createFunctionReferenceFor<typeof settings__ensure>("mutation", "settings/ensure"), get: createFunctionReferenceFor<typeof settings__get>("query", "settings/get"), update: createFunctionReferenceFor<typeof settings__update>("mutation", "settings/update") } } as const;
