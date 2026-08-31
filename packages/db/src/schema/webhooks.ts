import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaces } from "./workspaces";

export const webhookEvents = [
  "card.created",
  "card.updated",
  "card.moved",
  "card.deleted",
] as const;
export type WebhookEvent = (typeof webhookEvents)[number];

/**
 * Body shape a webhook is rendered into before delivery.
 *
 * "generic" sends the Kan payload unchanged. The chat formats exist because
 * their endpoints reject a body that does not match their own schema - e.g.
 * Discord requires one of content/embeds/components/file/poll and 400s
 * otherwise. Rocket.Chat and Mattermost accept the "slack" shape.
 */
export const webhookFormats = [
  "generic",
  "discord",
  "slack",
  "googleChat",
] as const;
export type WebhookFormat = (typeof webhookFormats)[number];
export const webhookFormatEnum = pgEnum("webhook_format", webhookFormats);

export const workspaceWebhooks = pgTable("workspace_webhooks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  workspaceId: bigint("workspaceId", { mode: "number" })
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  secret: text("secret"),
  events: text("events").notNull(), // JSON array of webhook events
  format: webhookFormatEnum("format").notNull().default("generic"),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("createdBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
}, (table) => [
  index("workspace_webhooks_workspace_idx").on(table.workspaceId),
]).enableRLS();

export const workspaceWebhooksRelations = relations(
  workspaceWebhooks,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceWebhooks.workspaceId],
      references: [workspaces.id],
      relationName: "workspaceWebhooksWorkspace",
    }),
    createdByUser: one(users, {
      fields: [workspaceWebhooks.createdBy],
      references: [users.id],
      relationName: "workspaceWebhooksCreatedByUser",
    }),
  }),
);
