import path from "node:path";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { app } from "electron";
import { createNodeSyncoreRuntime } from "syncorejs/node";
import schema from "../syncore/_generated/schema.js";
import { functions } from "../syncore/_generated/functions.js";

const DROP_TELEMETRY_RECORDS_MIGRATION_ID = "0001_drop_telemetry_records_manual.sql";
const ADD_SESSION_ACTIVE_KEY_MIGRATION_ID = "0002_add_session_active_key_manual.sql";

type SchemaSnapshotState = {
  tables?: SchemaSnapshotTable[];
};

type SchemaSnapshotTable = {
  name?: string;
  indexes?: Array<{ name?: string; fields?: string[] }>;
};

type SqliteNameRow = {
  name: string;
};

type SchemaStateRow = {
  schema_json: string;
};

const getAppSyncoreDatabasePath = (): string =>
  path.join(app.getPath("userData"), "syncore.db");

const tableExists = (database: DatabaseSync, tableName: string): boolean =>
  Boolean(database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as SqliteNameRow | undefined);

const readCurrentSchemaJson = (database: DatabaseSync): string | null => {
  if (!tableExists(database, "_syncore_schema_state")) {
    return null;
  }

  const row = database
    .prepare("SELECT schema_json FROM \"_syncore_schema_state\" WHERE id = 'current'")
    .get() as SchemaStateRow | undefined;
  return row?.schema_json ?? null;
};

const removeTableFromSchemaJson = (schemaJson: string | null, tableName: string): string | null => {
  if (!schemaJson) {
    return null;
  }

  const parsed = JSON.parse(schemaJson) as SchemaSnapshotState;
  const tables = parsed.tables;
  if (!Array.isArray(tables) || !tables.some((table) => table.name === tableName)) {
    return null;
  }

  return JSON.stringify({
    ...parsed,
    tables: tables.filter((table) => table.name !== tableName)
  });
};

const removeIndexFromSchemaJson = (
  schemaJson: string | null,
  tableName: string,
  indexName: string
): string | null => {
  if (!schemaJson) {
    return null;
  }

  const parsed = JSON.parse(schemaJson) as SchemaSnapshotState;
  const tables = parsed.tables;
  if (!Array.isArray(tables)) {
    return null;
  }

  let changed = false;
  const nextTables = tables.map((table) => {
    if (table.name !== tableName || !Array.isArray(table.indexes)) {
      return table;
    }

    const nextIndexes = table.indexes.filter((index) => index.name !== indexName);
    if (nextIndexes.length === table.indexes.length) {
      return table;
    }

    changed = true;
    return {
      ...table,
      indexes: nextIndexes
    };
  });

  if (!changed) {
    return null;
  }

  return JSON.stringify({
    ...parsed,
    tables: nextTables
  });
};

const addActiveKeyToExistingSessions = (database: DatabaseSync): boolean => {
  if (!tableExists(database, "dictationSessions")) {
    return false;
  }

  const rows = database
    .prepare("SELECT _id, _json FROM \"dictationSessions\"")
    .all() as Array<{ _id: string; _json: string }>;
  let changed = false;

  for (const row of rows) {
    const payload = JSON.parse(row._json) as Record<string, unknown>;
    if (typeof payload.activeKey === "string") {
      continue;
    }

    payload.activeKey = payload.isActive === true ? "active" : "inactive";
    database
      .prepare("UPDATE \"dictationSessions\" SET _json = ? WHERE _id = ?")
      .run(JSON.stringify(payload), row._id);
    changed = true;
  }

  return changed;
};

export function migrateAppSyncoreDatabase(): void {
  const databasePath = getAppSyncoreDatabasePath();
  if (!existsSync(databasePath)) {
    return;
  }

  const database = new DatabaseSync(databasePath);
  try {
    const hasTelemetryRecords = tableExists(database, "telemetryRecords");
    const currentSchemaJson = readCurrentSchemaJson(database);
    const schemaWithoutTelemetry = removeTableFromSchemaJson(currentSchemaJson, "telemetryRecords");
    const schemaWithoutOldActiveIndex = removeIndexFromSchemaJson(
      schemaWithoutTelemetry ?? currentSchemaJson,
      "dictationSessions",
      "by_active"
    );
    const dropTelemetrySql = [
      "-- Ditado manual Syncore migration: remove telemetryRecords.",
      "DROP TABLE IF EXISTS \"telemetryRecords\";"
    ].join("\n");
    const addActiveKeySql = [
      "-- Ditado manual Syncore migration: add activeKey to existing sessions.",
      "UPDATE \"dictationSessions\" SET _json = json_set(_json, '$.activeKey', CASE WHEN json_extract(_json, '$.isActive') THEN 'active' ELSE 'inactive' END) WHERE json_extract(_json, '$.activeKey') IS NULL;"
    ].join("\n");

    database.exec("BEGIN");
    try {
      database.exec(`
        CREATE TABLE IF NOT EXISTS "_syncore_migrations" (
          id TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          sql TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "_syncore_schema_state" (
          id TEXT PRIMARY KEY,
          schema_hash TEXT NOT NULL,
          schema_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      if (hasTelemetryRecords) {
        database.exec("DROP TABLE IF EXISTS \"telemetryRecords\"");
        database
          .prepare(`
            INSERT OR REPLACE INTO "_syncore_migrations" (id, applied_at, sql)
            VALUES (?, ?, ?)
          `)
          .run(DROP_TELEMETRY_RECORDS_MIGRATION_ID, Date.now(), dropTelemetrySql);
      }
      if (schemaWithoutTelemetry) {
        database
          .prepare(`
            UPDATE "_syncore_schema_state"
            SET schema_hash = ?, schema_json = ?, updated_at = ?
            WHERE id = 'current'
          `)
          .run("ditado-manual-drop-telemetryRecords", schemaWithoutTelemetry, Date.now());
      }
      const removedOldActiveIndex = Boolean(schemaWithoutOldActiveIndex);
      if (schemaWithoutOldActiveIndex) {
        database.exec("DROP INDEX IF EXISTS \"idx_dictationSessions_by_active\"");
        database
          .prepare(`
            UPDATE "_syncore_schema_state"
            SET schema_hash = ?, schema_json = ?, updated_at = ?
            WHERE id = 'current'
          `)
          .run("ditado-manual-drop-dictationSessions-by_active", schemaWithoutOldActiveIndex, Date.now());
      }
      if (addActiveKeyToExistingSessions(database) || removedOldActiveIndex) {
        database
          .prepare(`
            INSERT OR REPLACE INTO "_syncore_migrations" (id, applied_at, sql)
            VALUES (?, ?, ?)
          `)
          .run(ADD_SESSION_ACTIVE_KEY_MIGRATION_ID, Date.now(), addActiveKeySql);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export function createAppSyncoreRuntime() {
  const userDataDirectory = app.getPath("userData");
  return createNodeSyncoreRuntime({
    databasePath: path.join(userDataDirectory, "syncore.db"),
    storageDirectory: path.join(userDataDirectory, "syncore-storage"),
    schema,
    functions,
    platform: "electron-main"
  });
}
