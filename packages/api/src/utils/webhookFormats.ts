import type { WebhookFormat } from "@kan/db/schema";

import type { WebhookPayload } from "./webhook";

// Card titles are validated at up to 2000 characters, well past what the chat
// targets accept. Overflowing any of these is a rejected delivery, which is the
// failure this module exists to prevent.
const DISCORD_TITLE_MAX = 256;
const DISCORD_DESCRIPTION_MAX = 4096;
const GOOGLE_CHAT_TEXT_MAX = 4096;
const SLACK_TEXT_MAX = 40000;

/**
 * Slack treats &, < and > as control characters, so a raw card title can carry
 * <!channel>, <@U123> or a <url|label> link through Kan and into a workspace.
 * Card titles are editable by any board member, so they are untrusted text.
 * Escape before composing, then truncate, so a cut can never split an entity
 * back into a live control character.
 */
function escapeChatControlChars(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}

const eventLabels: Record<WebhookPayload["event"], string> = {
  "card.created": "Card created",
  "card.updated": "Card updated",
  "card.moved": "Card moved",
  "card.deleted": "Card deleted",
};

const embedColours: Record<WebhookPayload["event"], number> = {
  "card.created": 0x2ecc71,
  "card.updated": 0x3498db,
  "card.moved": 0xf1c40f,
  "card.deleted": 0xe74c3c,
};

function contextLine(payload: WebhookPayload): string {
  const { board, list, user } = payload.data;
  const parts = [
    board && `Board: ${board.name}`,
    list && `List: ${list.name}`,
    user?.name && `By: ${user.name}`,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

function plainSummary(payload: WebhookPayload): string {
  const heading = `${eventLabels[payload.event]}: ${payload.data.card.title}`;
  const context = contextLine(payload);

  return context ? `${heading}\n${context}` : heading;
}

function toDiscord(payload: WebhookPayload) {
  const context = contextLine(payload);

  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: truncate(
          `${eventLabels[payload.event]}: ${payload.data.card.title}`,
          DISCORD_TITLE_MAX,
        ),
        description: context
          ? truncate(context, DISCORD_DESCRIPTION_MAX)
          : undefined,
        color: embedColours[payload.event],
        timestamp: payload.timestamp,
        footer: { text: payload.data.card.publicId },
      },
    ],
  };
}

function toSlack(payload: WebhookPayload) {
  return {
    text: truncate(
      escapeChatControlChars(plainSummary(payload)),
      SLACK_TEXT_MAX,
    ),
  };
}

function toGoogleChat(payload: WebhookPayload) {
  return {
    text: truncate(
      escapeChatControlChars(plainSummary(payload)),
      GOOGLE_CHAT_TEXT_MAX,
    ),
  };
}

/**
 * Render a payload into the body shape the target expects.
 *
 * The chat endpoints validate the body against their own schema and reject
 * anything else, so a Kan-shaped payload posted to them fails before it is
 * ever displayed. "generic" is returned unchanged so existing consumers,
 * which were built against that envelope, are unaffected.
 */
export function renderWebhookBody(
  format: WebhookFormat,
  payload: WebhookPayload,
): unknown {
  switch (format) {
    case "discord":
      return toDiscord(payload);
    case "slack":
      return toSlack(payload);
    case "googleChat":
      return toGoogleChat(payload);
    case "generic":
      return payload;
    default:
      // Compile time: adding a WebhookFormat without a renderer fails the build
      // here rather than silently returning undefined, which JSON.stringify turns
      // into no request body at all. Runtime: a row written by a newer migration
      // than this code falls back to the envelope instead of sending nothing.
      assertRendererExists(format);
      return payload;
  }
}

function assertRendererExists(_format: never): void {
  // Intentionally empty - the parameter type is the assertion.
}
