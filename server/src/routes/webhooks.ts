import { Router } from "express";
import express from "express";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/express";
import { syncClerkUser, removeClerkUser } from "../lib/sync-user.js";

export const webhooksRouter = Router();

/**
 * POST /api/webhooks/clerk
 * Clerk → Neon durable sync. Verifies the Svix signature against
 * CLERK_WEBHOOK_SECRET and provisions the user in Neon (link by email, assign
 * ADMIN/USHER role, write the role back to Clerk public metadata).
 *
 * NOTE: this router is mounted BEFORE app.use(express.json()) in app.ts because
 * Svix signs the raw request body.
 */
webhooksRouter.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "CLERK_WEBHOOK_SECRET is not configured on the server" });
    }

    const headers = req.headers;
    const svixId = headers["svix-id"];
    const svixTimestamp = headers["svix-timestamp"];
    const svixSignature = headers["svix-signature"];

    if (
      typeof svixId !== "string" ||
      typeof svixTimestamp !== "string" ||
      typeof svixSignature !== "string"
    ) {
      return res.status(400).json({ error: "Missing Svix signature headers" });
    }

    const body = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);

    let event: WebhookEvent;
    try {
      event = new Webhook(secret).verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as unknown as WebhookEvent;
    } catch {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    try {
      if (event.type === "user.created" || event.type === "user.updated") {
        const data = event.data;
        const primary = data.email_addresses?.find((e) => e.id === data.primary_email_address_id);
        const email = primary?.email_address ?? data.email_addresses?.[0]?.email_address;
        if (!email) {
          return res.status(200).json({ received: true, skipped: "user has no email" });
        }
        const result = await syncClerkUser({
          clerkId: data.id,
          email,
          name: [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
          role: data.public_metadata?.role as string | string[] | undefined,
        });
        return res.status(200).json({ received: true, synced: result });
      }

      if (event.type === "user.deleted") {
        if (!event.data.id) {
          return res.status(200).json({ received: true, skipped: "no user id" });
        }
        const removed = await removeClerkUser(event.data.id);
        return res.status(200).json({ received: true, removed });
      }

      return res.status(200).json({ received: true, ignored: event.type });
    } catch (err) {
      console.error("[webhook] sync failed:", err);
      return res.status(500).json({ error: "Internal webhook sync error" });
    }
  }
);