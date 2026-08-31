import { describe, expect, it } from "vitest";

import type { WebhookPayload } from "./webhook";
import { renderWebhookBody } from "./webhookFormats";

const basePayload: WebhookPayload = {
  event: "card.created",
  timestamp: "2024-01-15T12:00:00.000Z",
  data: {
    card: {
      id: "1",
      publicId: "card-abc123",
      title: "Fix login bug",
      description: "Users cannot sign in",
      listId: "list-1",
      boardId: "board-1",
    },
    board: { id: "board-1", name: "Engineering" },
    list: { id: "list-1", name: "Backlog" },
    user: { id: "user-1", name: "Ada" },
  },
};

describe("renderWebhookBody", () => {
  describe("generic", () => {
    it("passes the payload through untouched", () => {
      expect(renderWebhookBody("generic", basePayload)).toEqual(basePayload);
    });
  });

  describe("discord", () => {
    it("produces a body containing at least one of Discord's required fields", () => {
      // Discord rejects any body without content, embeds, components, file or poll.
      const body = renderWebhookBody("discord", basePayload) as Record<
        string,
        unknown
      >;
      const required = ["content", "embeds", "components", "file", "poll"];
      expect(required.some((key) => key in body)).toBe(true);
    });

    it("names the card and the board in the embed", () => {
      const body = JSON.stringify(renderWebhookBody("discord", basePayload));
      expect(body).toContain("Fix login bug");
      expect(body).toContain("Engineering");
    });
  });

  describe("slack", () => {
    it("produces a non-empty text field", () => {
      const body = renderWebhookBody("slack", basePayload) as { text?: string };
      expect(typeof body.text).toBe("string");
      expect(body.text?.length).toBeGreaterThan(0);
      expect(body.text).toContain("Fix login bug");
    });
  });

  describe("googleChat", () => {
    it("produces a non-empty text field", () => {
      const body = renderWebhookBody("googleChat", basePayload) as {
        text?: string;
      };
      expect(typeof body.text).toBe("string");
      expect(body.text).toContain("Fix login bug");
    });
  });

  describe("every chat format, for every event", () => {
    const events = [
      "card.created",
      "card.updated",
      "card.moved",
      "card.deleted",
    ] as const;
    const chatFormats = ["discord", "slack", "googleChat"] as const;

    for (const format of chatFormats) {
      for (const event of events) {
        it(`${format} renders a non-empty body for ${event}`, () => {
          const body = renderWebhookBody(format, {
            ...basePayload,
            event,
          });
          expect(JSON.stringify(body).length).toBeGreaterThan(2);
        });
      }
    }

    it("survives a payload with only the required card fields", () => {
      const minimal: WebhookPayload = {
        event: "card.deleted",
        timestamp: "2024-01-15T12:00:00.000Z",
        data: {
          card: {
            id: "1",
            publicId: "card-abc123",
            title: "Untitled",
            listId: "list-1",
            boardId: "board-1",
          },
        },
      };

      for (const format of chatFormats) {
        const body = renderWebhookBody(format, minimal);
        expect(JSON.stringify(body)).toContain("Untitled");
      }
    });
  });
});
