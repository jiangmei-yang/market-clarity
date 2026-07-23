import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userSnapshots = sqliteTable("user_snapshots", {
  ownerKey: text("owner_key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiProviderProfiles = sqliteTable("ai_provider_profiles", {
  ownerKey: text("owner_key").notNull(),
  providerId: text("provider_id").notNull(),
  displayName: text("display_name").notNull(),
  providerType: text("provider_type").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  apiMode: text("api_mode").notNull(),
  enabled: integer("enabled").notNull(),
  capabilities: text("capabilities").notNull(),
  secretCipher: text("secret_cipher").notNull(),
  secretIv: text("secret_iv").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns:[table.ownerKey, table.providerId] })]);
