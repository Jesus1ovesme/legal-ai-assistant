/**
 * Сводный schema-объект для drizzle-orm Client. Используется для type-safe queries
 * через `db.query.<table>.findFirst()` и для `drizzle-kit generate`.
 */
export * from "./enums";
export * from "./users";
export * from "./folders";
export * from "./files";
export * from "./messages";
export * from "./embeddings";
export * from "./sessions";
export * from "./audit";
export * from "./tool-call-log";
export * from "./caches";
export * from "./quota";

import * as users from "./users";
import * as folders from "./folders";
import * as files from "./files";
import * as messages from "./messages";
import * as embeddings from "./embeddings";
import * as sessions from "./sessions";
import * as audit from "./audit";
import * as toolCallLog from "./tool-call-log";
import * as caches from "./caches";
import * as quota from "./quota";

export const schema = {
  ...users,
  ...folders,
  ...files,
  ...messages,
  ...embeddings,
  ...sessions,
  ...audit,
  ...toolCallLog,
  ...caches,
  ...quota,
};
