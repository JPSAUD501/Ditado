/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncorejs";
import { composeProjectFunctionRegistry } from "syncorejs";
import { appendWithAudio as history__appendWithAudio } from "../functions/history.js";
import { audio as history__audio } from "../functions/history.js";
import { clear as history__clear } from "../functions/history.js";
import { list as history__list } from "../functions/history.js";
import { page as history__page } from "../functions/history.js";
import { remove as history__remove } from "../functions/history.js";
import { search as history__search } from "../functions/history.js";
import { stats as history__stats } from "../functions/history.js";
import { listJobs as maintenance__listJobs } from "../functions/maintenance.js";
import { pruneHistory as maintenance__pruneHistory } from "../functions/maintenance.js";
import { schedulePrune as maintenance__schedulePrune } from "../functions/maintenance.js";
import { active as sessions__active } from "../functions/sessions.js";
import { appendPartial as sessions__appendPartial } from "../functions/sessions.js";
import { byId as sessions__byId } from "../functions/sessions.js";
import { cancel as sessions__cancel } from "../functions/sessions.js";
import { complete as sessions__complete } from "../functions/sessions.js";
import { dismissCurrent as sessions__dismissCurrent } from "../functions/sessions.js";
import { fail as sessions__fail } from "../functions/sessions.js";
import { finalizeInterruptedActive as sessions__finalizeInterruptedActive } from "../functions/sessions.js";
import { markListening as sessions__markListening } from "../functions/sessions.js";
import { markProcessing as sessions__markProcessing } from "../functions/sessions.js";
import { markRecorderFailed as sessions__markRecorderFailed } from "../functions/sessions.js";
import { notice as sessions__notice } from "../functions/sessions.js";
import { recent as sessions__recent } from "../functions/sessions.js";
import { requestStop as sessions__requestStop } from "../functions/sessions.js";
import { start as sessions__start } from "../functions/sessions.js";
import { updateContext as sessions__updateContext } from "../functions/sessions.js";
import { ensure as settings__ensure } from "../functions/settings.js";
import { get as settings__get } from "../functions/settings.js";
import { update as settings__update } from "../functions/settings.js";

const componentsManifest = {} as const;

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreRootFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `history/appendWithAudio`.
   */
  readonly "history/appendWithAudio": typeof history__appendWithAudio;
  /**
   * Runtime definition for the public Syncore query `history/audio`.
   */
  readonly "history/audio": typeof history__audio;
  /**
   * Runtime definition for the public Syncore mutation `history/clear`.
   */
  readonly "history/clear": typeof history__clear;
  /**
   * Runtime definition for the public Syncore query `history/list`.
   */
  readonly "history/list": typeof history__list;
  /**
   * Runtime definition for the public Syncore query `history/page`.
   */
  readonly "history/page": typeof history__page;
  /**
   * Runtime definition for the public Syncore mutation `history/remove`.
   */
  readonly "history/remove": typeof history__remove;
  /**
   * Runtime definition for the public Syncore query `history/search`.
   */
  readonly "history/search": typeof history__search;
  /**
   * Runtime definition for the public Syncore query `history/stats`.
   */
  readonly "history/stats": typeof history__stats;
  /**
   * Runtime definition for the public Syncore query `maintenance/listJobs`.
   */
  readonly "maintenance/listJobs": typeof maintenance__listJobs;
  /**
   * Runtime definition for the public Syncore mutation `maintenance/pruneHistory`.
   */
  readonly "maintenance/pruneHistory": typeof maintenance__pruneHistory;
  /**
   * Runtime definition for the public Syncore mutation `maintenance/schedulePrune`.
   */
  readonly "maintenance/schedulePrune": typeof maintenance__schedulePrune;
  /**
   * Runtime definition for the public Syncore query `sessions/active`.
   */
  readonly "sessions/active": typeof sessions__active;
  /**
   * Runtime definition for the public Syncore mutation `sessions/appendPartial`.
   */
  readonly "sessions/appendPartial": typeof sessions__appendPartial;
  /**
   * Runtime definition for the public Syncore query `sessions/byId`.
   */
  readonly "sessions/byId": typeof sessions__byId;
  /**
   * Runtime definition for the public Syncore mutation `sessions/cancel`.
   */
  readonly "sessions/cancel": typeof sessions__cancel;
  /**
   * Runtime definition for the public Syncore mutation `sessions/complete`.
   */
  readonly "sessions/complete": typeof sessions__complete;
  /**
   * Runtime definition for the public Syncore mutation `sessions/dismissCurrent`.
   */
  readonly "sessions/dismissCurrent": typeof sessions__dismissCurrent;
  /**
   * Runtime definition for the public Syncore mutation `sessions/fail`.
   */
  readonly "sessions/fail": typeof sessions__fail;
  /**
   * Runtime definition for the public Syncore mutation `sessions/finalizeInterruptedActive`.
   */
  readonly "sessions/finalizeInterruptedActive": typeof sessions__finalizeInterruptedActive;
  /**
   * Runtime definition for the public Syncore mutation `sessions/markListening`.
   */
  readonly "sessions/markListening": typeof sessions__markListening;
  /**
   * Runtime definition for the public Syncore mutation `sessions/markProcessing`.
   */
  readonly "sessions/markProcessing": typeof sessions__markProcessing;
  /**
   * Runtime definition for the public Syncore mutation `sessions/markRecorderFailed`.
   */
  readonly "sessions/markRecorderFailed": typeof sessions__markRecorderFailed;
  /**
   * Runtime definition for the public Syncore mutation `sessions/notice`.
   */
  readonly "sessions/notice": typeof sessions__notice;
  /**
   * Runtime definition for the public Syncore query `sessions/recent`.
   */
  readonly "sessions/recent": typeof sessions__recent;
  /**
   * Runtime definition for the public Syncore mutation `sessions/requestStop`.
   */
  readonly "sessions/requestStop": typeof sessions__requestStop;
  /**
   * Runtime definition for the public Syncore mutation `sessions/start`.
   */
  readonly "sessions/start": typeof sessions__start;
  /**
   * Runtime definition for the public Syncore mutation `sessions/updateContext`.
   */
  readonly "sessions/updateContext": typeof sessions__updateContext;
  /**
   * Runtime definition for the public Syncore mutation `settings/ensure`.
   */
  readonly "settings/ensure": typeof settings__ensure;
  /**
   * Runtime definition for the public Syncore query `settings/get`.
   */
  readonly "settings/get": typeof settings__get;
  /**
   * Runtime definition for the public Syncore mutation `settings/update`.
   */
  readonly "settings/update": typeof settings__update;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
const rootFunctions: SyncoreRootFunctionsRegistry = {
  "history/list": history__list,
  "history/page": history__page,
  "history/search": history__search,
  "history/stats": history__stats,
  "history/appendWithAudio": history__appendWithAudio,
  "history/remove": history__remove,
  "history/clear": history__clear,
  "history/audio": history__audio,
  "maintenance/listJobs": maintenance__listJobs,
  "maintenance/pruneHistory": maintenance__pruneHistory,
  "maintenance/schedulePrune": maintenance__schedulePrune,
  "sessions/active": sessions__active,
  "sessions/byId": sessions__byId,
  "sessions/recent": sessions__recent,
  "sessions/start": sessions__start,
  "sessions/updateContext": sessions__updateContext,
  "sessions/markListening": sessions__markListening,
  "sessions/markRecorderFailed": sessions__markRecorderFailed,
  "sessions/requestStop": sessions__requestStop,
  "sessions/markProcessing": sessions__markProcessing,
  "sessions/appendPartial": sessions__appendPartial,
  "sessions/complete": sessions__complete,
  "sessions/fail": sessions__fail,
  "sessions/notice": sessions__notice,
  "sessions/cancel": sessions__cancel,
  "sessions/finalizeInterruptedActive": sessions__finalizeInterruptedActive,
  "sessions/dismissCurrent": sessions__dismissCurrent,
  "settings/get": settings__get,
  "settings/ensure": settings__ensure,
  "settings/update": settings__update,
} as const;

export const functions: SyncoreFunctionRegistry = composeProjectFunctionRegistry(rootFunctions, componentsManifest);
