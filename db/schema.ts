import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userSnapshots = sqliteTable("user_snapshots", {
  ownerKey: text("owner_key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
