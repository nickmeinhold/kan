import type { WebhookFormat } from "@kan/db/schema";

import type { WebhookPayload } from "./webhook";

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
    embeds: [
      {
        title: `${eventLabels[payload.event]}: ${payload.data.card.title}`,
        description: context || undefined,
        color: embedColours[payload.event],
        timestamp: payload.timestamp,
        footer: { text: payload.data.card.publicId },
      },
    ],
  };
}

function toSlack(payload: WebhookPayload) {
  return { text: plainSummary(payload) };
}

function toGoogleChat(payload: WebhookPayload) {
  return { text: plainSummary(payload) };
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
  }
}
