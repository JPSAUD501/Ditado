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

import type { append as history__append } from "../functions/history.js";
import type { appendWithAudio as history__appendWithAudio } from "../functions/history.js";
import type { clear as history__clear } from "../functions/history.js";
import type { deleteEntry as history__deleteEntry } from "../functions/history.js";
import type { getAudio as history__getAudio } from "../functions/history.js";
import type { list as history__list } from "../functions/history.js";
import type { markLegacyImportCompleted as migration__markLegacyImportCompleted } from "../functions/migration.js";
import type { status as migration__status } from "../functions/migration.js";
import type { ensureInitialized as settings__ensureInitialized } from "../functions/settings.js";
import type { get as settings__get } from "../functions/settings.js";
import type { patch as settings__patch } from "../functions/settings.js";
import type { append as telemetry__append } from "../functions/telemetry.js";
import type { importLegacy as telemetry__importLegacy } from "../functions/telemetry.js";
import type { tail as telemetry__tail } from "../functions/telemetry.js";

/**
 * Type-safe references to functions exported from `syncore/functions/history.ts`.
 */
export interface SyncoreApi__history {
  /**
   * Reference to the public Syncore mutation `history/append`.
   */
  readonly append: FunctionReferenceFor<typeof history__append>;
  /**
   * Reference to the public Syncore mutation `history/appendWithAudio`.
   */
  readonly appendWithAudio: FunctionReferenceFor<typeof history__appendWithAudio>;
  /**
   * Reference to the public Syncore mutation `history/clear`.
   */
  readonly clear: FunctionReferenceFor<typeof history__clear>;
  /**
   * Reference to the public Syncore mutation `history/deleteEntry`.
   */
  readonly deleteEntry: FunctionReferenceFor<typeof history__deleteEntry>;
  /**
   * Reference to the public Syncore query `history/getAudio`.
   */
  readonly getAudio: FunctionReferenceFor<typeof history__getAudio>;
  /**
   * Reference to the public Syncore query `history/list`.
   */
  readonly list: FunctionReferenceFor<typeof history__list>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/migration.ts`.
 */
export interface SyncoreApi__migration {
  /**
   * Reference to the public Syncore mutation `migration/markLegacyImportCompleted`.
   */
  readonly markLegacyImportCompleted: FunctionReferenceFor<typeof migration__markLegacyImportCompleted>;
  /**
   * Reference to the public Syncore query `migration/status`.
   */
  readonly status: FunctionReferenceFor<typeof migration__status>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/settings.ts`.
 */
export interface SyncoreApi__settings {
  /**
   * Reference to the public Syncore mutation `settings/ensureInitialized`.
   */
  readonly ensureInitialized: FunctionReferenceFor<typeof settings__ensureInitialized>;
  /**
   * Reference to the public Syncore query `settings/get`.
   */
  readonly get: FunctionReferenceFor<typeof settings__get>;
  /**
   * Reference to the public Syncore mutation `settings/patch`.
   */
  readonly patch: FunctionReferenceFor<typeof settings__patch>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/telemetry.ts`.
 */
export interface SyncoreApi__telemetry {
  /**
   * Reference to the public Syncore mutation `telemetry/append`.
   */
  readonly append: FunctionReferenceFor<typeof telemetry__append>;
  /**
   * Reference to the public Syncore mutation `telemetry/importLegacy`.
   */
  readonly importLegacy: FunctionReferenceFor<typeof telemetry__importLegacy>;
  /**
   * Reference to the public Syncore query `telemetry/tail`.
   */
  readonly tail: FunctionReferenceFor<typeof telemetry__tail>;
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
   * Functions exported from `syncore/functions/migration.ts`.
   */
  readonly migration: SyncoreApi__migration;
  /**
   * Functions exported from `syncore/functions/settings.ts`.
   */
  readonly settings: SyncoreApi__settings;
  /**
   * Functions exported from `syncore/functions/telemetry.ts`.
   */
  readonly telemetry: SyncoreApi__telemetry;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { history: { append: createFunctionReferenceFor<typeof history__append>("mutation", "history/append"), appendWithAudio: createFunctionReferenceFor<typeof history__appendWithAudio>("mutation", "history/appendWithAudio"), clear: createFunctionReferenceFor<typeof history__clear>("mutation", "history/clear"), deleteEntry: createFunctionReferenceFor<typeof history__deleteEntry>("mutation", "history/deleteEntry"), getAudio: createFunctionReferenceFor<typeof history__getAudio>("query", "history/getAudio"), list: createFunctionReferenceFor<typeof history__list>("query", "history/list") }, migration: { markLegacyImportCompleted: createFunctionReferenceFor<typeof migration__markLegacyImportCompleted>("mutation", "migration/markLegacyImportCompleted"), status: createFunctionReferenceFor<typeof migration__status>("query", "migration/status") }, settings: { ensureInitialized: createFunctionReferenceFor<typeof settings__ensureInitialized>("mutation", "settings/ensureInitialized"), get: createFunctionReferenceFor<typeof settings__get>("query", "settings/get"), patch: createFunctionReferenceFor<typeof settings__patch>("mutation", "settings/patch") }, telemetry: { append: createFunctionReferenceFor<typeof telemetry__append>("mutation", "telemetry/append"), importLegacy: createFunctionReferenceFor<typeof telemetry__importLegacy>("mutation", "telemetry/importLegacy"), tail: createFunctionReferenceFor<typeof telemetry__tail>("query", "telemetry/tail") } } as const;
