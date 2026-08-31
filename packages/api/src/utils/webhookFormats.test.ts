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

  describe("target field limits", () => {
    // Card titles are validated at up to 2000 chars (card.ts), while Discord
    // caps an embed title at 256 and the whole embed at 6000. Overflowing any
    // of them is a 400 - the exact failure this feature exists to remove.
    const longTitle = "A".repeat(2000);
    const longPayload: WebhookPayload = {
      ...basePayload,
      data: {
        ...basePayload.data,
        card: { ...basePayload.data.card, title: longTitle },
        board: { id: "board-1", name: "B".repeat(300) },
        list: { id: "list-1", name: "L".repeat(300) },
      },
    };

    it("keeps the Discord embed title within 256 characters", () => {
      const body = renderWebhookBody("discord", longPayload) as {
        embeds: { title: string }[];
      };

      expect(body.embeds[0]!.title.length).toBeLessThanOrEqual(256);
    });

    it("keeps the Discord embed description within 4096 characters", () => {
      const body = renderWebhookBody("discord", longPayload) as {
        embeds: { description?: string }[];
      };

      expect((body.embeds[0]!.description ?? "").length).toBeLessThanOrEqual(
        4096,
      );
    });

    it("keeps the whole Discord embed within the 6000 character budget", () => {
      const body = renderWebhookBody("discord", longPayload) as {
        embeds: {
          title: string;
          description?: string;
          footer?: { text: string };
        }[];
      };
      const embed = body.embeds[0]!;
      const total =
        embed.title.length +
        (embed.description ?? "").length +
        (embed.footer?.text ?? "").length;

      expect(total).toBeLessThanOrEqual(6000);
    });

    it("keeps Google Chat text within 4096 characters", () => {
      const body = renderWebhookBody("googleChat", longPayload) as {
        text: string;
      };

      expect(body.text.length).toBeLessThanOrEqual(4096);
    });

    it("still identifies the card after truncating", () => {
      const body = renderWebhookBody("discord", longPayload) as {
        embeds: { title: string }[];
      };

      expect(body.embeds[0]!.title).toContain("Card created");
      expect(body.embeds[0]!.title).toContain("AAA");
    });
  });

  describe("control characters in card titles", () => {
    // A card title is user-controlled text. Slack treats &, < and > as control
    // characters, so an unescaped title lets anyone who can edit a card fire a
    // channel-wide mention or a disguised link through Kan - a privilege the
    // JSON envelope never granted, because Slack never rendered it.
    const hostile = (title: string): WebhookPayload => ({
      ...basePayload,
      data: { ...basePayload.data, card: { ...basePayload.data.card, title } },
    });

    it("does not let a card title fire a Slack channel-wide mention", () => {
      const body = renderWebhookBody(
        "slack",
        hostile("Deploy <!channel> now"),
      ) as { text: string };

      expect(body.text).not.toContain("<!channel>");
      expect(body.text).toContain("&lt;!channel&gt;");
    });

    it("does not let a card title emit a disguised Slack link", () => {
      const body = renderWebhookBody(
        "slack",
        hostile("<https://evil.example.com|Click here>"),
      ) as { text: string };

      expect(body.text).not.toContain("<https://evil.example.com|");
    });

    it("escapes ampersands per Slack's control-character rules", () => {
      const body = renderWebhookBody("slack", hostile("Tom & Jerry")) as {
        text: string;
      };

      expect(body.text).toContain("Tom &amp; Jerry");
    });

    it("neutralises angle brackets for Google Chat too", () => {
      const body = renderWebhookBody(
        "googleChat",
        hostile("ping <users/all> please"),
      ) as { text: string };

      expect(body.text).not.toContain("<users/all>");
    });

    it("tells Discord to parse no mentions at all", () => {
      const body = renderWebhookBody(
        "discord",
        hostile("@everyone deploy now"),
      ) as { allowed_mentions?: { parse: string[] } };

      expect(body.allowed_mentions?.parse).toEqual([]);
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
