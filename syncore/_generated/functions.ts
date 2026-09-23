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
import { append as history__append } from "../functions/history.js";
import { appendWithAudio as history__appendWithAudio } from "../functions/history.js";
import { clear as history__clear } from "../functions/history.js";
import { deleteEntry as history__deleteEntry } from "../functions/history.js";
import { getAudio as history__getAudio } from "../functions/history.js";
import { list as history__list } from "../functions/history.js";
import { markLegacyImportCompleted as migration__markLegacyImportCompleted } from "../functions/migration.js";
import { status as migration__status } from "../functions/migration.js";
import { ensureInitialized as settings__ensureInitialized } from "../functions/settings.js";
import { get as settings__get } from "../functions/settings.js";
import { patch as settings__patch } from "../functions/settings.js";
import { append as telemetry__append } from "../functions/telemetry.js";
import { importLegacy as telemetry__importLegacy } from "../functions/telemetry.js";
import { tail as telemetry__tail } from "../functions/telemetry.js";

const componentsManifest = {} as const;

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreRootFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `history/append`.
   */
  readonly "history/append": typeof history__append;
  /**
   * Runtime definition for the public Syncore mutation `history/appendWithAudio`.
   */
  readonly "history/appendWithAudio": typeof history__appendWithAudio;
  /**
   * Runtime definition for the public Syncore mutation `history/clear`.
   */
  readonly "history/clear": typeof history__clear;
  /**
   * Runtime definition for the public Syncore mutation `history/deleteEntry`.
   */
  readonly "history/deleteEntry": typeof history__deleteEntry;
  /**
   * Runtime definition for the public Syncore query `history/getAudio`.
   */
  readonly "history/getAudio": typeof history__getAudio;
  /**
   * Runtime definition for the public Syncore query `history/list`.
   */
  readonly "history/list": typeof history__list;
  /**
   * Runtime definition for the public Syncore mutation `migration/markLegacyImportCompleted`.
   */
  readonly "migration/markLegacyImportCompleted": typeof migration__markLegacyImportCompleted;
  /**
   * Runtime definition for the public Syncore query `migration/status`.
   */
  readonly "migration/status": typeof migration__status;
  /**
   * Runtime definition for the public Syncore mutation `settings/ensureInitialized`.
   */
  readonly "settings/ensureInitialized": typeof settings__ensureInitialized;
  /**
   * Runtime definition for the public Syncore query `settings/get`.
   */
  readonly "settings/get": typeof settings__get;
  /**
   * Runtime definition for the public Syncore mutation `settings/patch`.
   */
  readonly "settings/patch": typeof settings__patch;
  /**
   * Runtime definition for the public Syncore mutation `telemetry/append`.
   */
  readonly "telemetry/append": typeof telemetry__append;
  /**
   * Runtime definition for the public Syncore mutation `telemetry/importLegacy`.
   */
  readonly "telemetry/importLegacy": typeof telemetry__importLegacy;
  /**
   * Runtime definition for the public Syncore query `telemetry/tail`.
   */
  readonly "telemetry/tail": typeof telemetry__tail;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
const rootFunctions: SyncoreRootFunctionsRegistry = {
  "history/list": history__list,
  "history/append": history__append,
  "history/appendWithAudio": history__appendWithAudio,
  "history/deleteEntry": history__deleteEntry,
  "history/clear": history__clear,
  "history/getAudio": history__getAudio,
  "migration/status": migration__status,
  "migration/markLegacyImportCompleted": migration__markLegacyImportCompleted,
  "settings/get": settings__get,
  "settings/ensureInitialized": settings__ensureInitialized,
  "settings/patch": settings__patch,
  "telemetry/tail": telemetry__tail,
  "telemetry/append": telemetry__append,
  "telemetry/importLegacy": telemetry__importLegacy,
} as const;

export const functions: SyncoreFunctionRegistry = composeProjectFunctionRegistry(rootFunctions, componentsManifest);
