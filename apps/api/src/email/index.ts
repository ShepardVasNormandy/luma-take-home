import { Resend } from "resend";
import { requireConfig } from "../config.js";

export interface SendReviewEmailInput {
  pendingCount: number;
  importName: string;
  reviewUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendReviewEmail(input: SendReviewEmailInput): Promise<{ id: string }> {
  const apiKey = requireConfig("RESEND_API_KEY");
  const from = requireConfig("REVIEW_FROM_EMAIL");
  const to = requireConfig("REVIEWER_EMAIL");

  const subject = `${input.pendingCount} shots ready for review`;
  const safeImportName = escapeHtml(input.importName);
  const safeUrl = escapeHtml(input.reviewUrl);

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
  <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px;">New candidates from <strong>${safeImportName}</strong> are ready for your review.</p>
  <a href="${safeUrl}" style="display: inline-block; padding: 16px 32px; background-color: #111111; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600;">Review shots</a>
  <p style="font-size: 13px; line-height: 1.5; color: #6b6b6b; margin: 24px 0 0;">Or open this link: <a href="${safeUrl}" style="color: #6b6b6b;">${safeUrl}</a></p>
</div>`;

  const text = `New candidates from ${input.importName} are ready for your review.\n\nReview shots: ${input.reviewUrl}\n`;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from, to, subject, html, text });

  if (error) {
    throw new Error(`Failed to send review email via Resend: ${error.message}`);
  }
  if (!data) {
    throw new Error("Failed to send review email via Resend: no response data");
  }
  return { id: data.id };
}
