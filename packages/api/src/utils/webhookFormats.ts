import type { WebhookFormat } from "@kan/db/schema";

import type { WebhookPayload } from "./webhook";

// Card titles are validated at up to 2000 characters, well past what the chat
// targets accept. Overflowing any of these is a rejected delivery, which is the
// failure this module exists to prevent.
const DISCORD_TITLE_MAX = 256;
const DISCORD_DESCRIPTION_MAX = 4096;
// Google does not document whether its 4096 ceiling counts characters or bytes,
// so this budget is spent in UTF-8 bytes: the stricter reading is safe under
// either, and a CJK title would exceed a byte ceiling long before a char one.
const GOOGLE_CHAT_TEXT_MAX_BYTES = 4096;
// A conservative ceiling rather than Slack's documented maximum, which is far
// larger than anything Kan can currently produce. It guards against future
// field growth, not against Slack itself.
const SLACK_TEXT_MAX = 16383;

/**
 * Slack treats &, < and > as control characters, so a raw card title can carry
 * <!channel>, <@U123> or a <url|label> link through Kan and into a workspace.
 * Card titles are editable by any board member, so they are untrusted text.
 * Applied to the composed summary and before truncation, so a cut can never
 * split an entity back into a live control character. Discord is not escaped:
 * it does not use HTML entities, and mentions are suppressed there with
 * allowed_mentions instead.
 *
 * This handles Slack's grammar only. Mattermost and Rocket.Chat accept the same
 * body shape but mention with bare @channel / @all / @here, which these entities
 * do not touch, so they are deliberately not offered as targets here.
 */
function escapeChatControlChars(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  // Iterate code points, not UTF-16 code units: slicing mid-surrogate emits a
  // lone surrogate, which Discord's embed validator rejects with the same 400
  // this module exists to avoid. Budget is still measured in code units,
  // because that is the unit the targets count.
  let out = "";
  for (const codePoint of value) {
    if (out.length + codePoint.length > max - 1) break;
    out += codePoint;
  }
  return `${out}\u2026`;
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

function truncateBytes(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;

  let out = "";
  let used = 0;
  for (const codePoint of value) {
    const size = encoder.encode(codePoint).length;
    // Leave room for the ellipsis, which is 3 bytes in UTF-8.
    if (used + size > maxBytes - 3) break;
    out += codePoint;
    used += size;
  }
  return `${out}\u2026`;
}

function toGoogleChat(payload: WebhookPayload) {
  return {
    text: truncateBytes(
      escapeChatControlChars(plainSummary(payload)),
      GOOGLE_CHAT_TEXT_MAX_BYTES,
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
      // Reached only when the row holds a format this build has no renderer for
      // (a newer migration than the running code). Posting the Kan envelope at a
      // chat URL would just reproduce the original 400, so fail closed instead:
      // sendWebhookToUrl catches this and records a delivery failure.
      throw new Error(`No renderer for webhook format: ${String(format)}`);
  }
}

function assertRendererExists(_format: never): void {
  // Intentionally empty - the parameter type is the assertion.
}
