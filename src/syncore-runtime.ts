import path from "node:path";
import { app } from "electron";
import { createNodeSyncoreRuntime } from "syncorejs/node";
import schema from "../syncore/_generated/schema.js";
import { resolvedComponents } from "../syncore/_generated/components.js";
import { functions } from "../syncore/_generated/functions.js";

export function createAppSyncoreRuntime() {
  const userDataDirectory = app.getPath("userData");
  return createNodeSyncoreRuntime({
    databasePath: path.join(userDataDirectory, "syncore.db"),
    storageDirectory: path.join(userDataDirectory, "syncore-storage"),
    schema,
    functions,
    components: resolvedComponents,
    platform: "electron-main",
    appName: "Ditado",
  });
}
