import { cronJobs } from "syncorejs";
import { api } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "prune-history",
  { hours: 24 },
  api.maintenance.pruneHistory,
  {},
  { type: "run_once_if_missed" }
);

export default crons;
