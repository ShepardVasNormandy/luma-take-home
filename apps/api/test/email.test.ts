import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, resendCtor } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  resendCtor: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(apiKey: string) {
      resendCtor(apiKey);
    }
  },
}));

process.env.RESEND_API_KEY = "re_test_key";
process.env.REVIEW_FROM_EMAIL = "Shots <review@shots.example>";
process.env.REVIEWER_EMAIL = "ellie@example.com";

const { sendReviewEmail } = await import("../src/email/index.js");

const input = {
  pendingCount: 7,
  importName: "Spring Drop",
  reviewUrl: "https://web.example/review/tok_abc123",
};

beforeEach(() => {
  sendMock.mockReset();
  resendCtor.mockClear();
  sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
});

describe("sendReviewEmail", () => {
  it("formats the subject as 'N shots ready for review'", async () => {
    await sendReviewEmail(input);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]![0].subject).toBe("7 shots ready for review");

    await sendReviewEmail({ ...input, pendingCount: 1 });
    expect(sendMock.mock.calls[1]![0].subject).toBe("1 shots ready for review");
  });

  it("wires to/from/apiKey from config env", async () => {
    await sendReviewEmail(input);
    expect(resendCtor).toHaveBeenCalledWith("re_test_key");
    expect(sendMock.mock.calls[0]![0]).toMatchObject({
      from: "Shots <review@shots.example>",
      to: "ellie@example.com",
    });
  });

  it("includes the review URL in both HTML and text bodies", async () => {
    await sendReviewEmail(input);
    const { html, text } = sendMock.mock.calls[0]![0];
    expect(html).toContain(`href="${input.reviewUrl}"`);
    expect(html).toContain(input.reviewUrl);
    expect(text).toContain(input.reviewUrl);
  });

  it("names the import in the body and keeps it transport-only (no images)", async () => {
    await sendReviewEmail(input);
    const { html, text } = sendMock.mock.calls[0]![0];
    expect(html).toContain("Spring Drop");
    expect(html).toContain("Review shots");
    expect(html).not.toContain("<img");
    expect(text).toContain("Spring Drop");
  });

  it("escapes HTML in the import name", async () => {
    await sendReviewEmail({ ...input, importName: 'Drop <b>"1"</b> & co' });
    const { html } = sendMock.mock.calls[0]![0];
    expect(html).toContain("Drop &lt;b&gt;&quot;1&quot;&lt;/b&gt; &amp; co");
    expect(html).not.toContain("<b>");
  });

  it("returns the Resend email id", async () => {
    await expect(sendReviewEmail(input)).resolves.toEqual({ id: "email_123" });
  });

  it("surfaces a Resend error as a thrown Error with its message", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "The shots.example domain is not verified" },
    });
    await expect(sendReviewEmail(input)).rejects.toThrow(
      "Failed to send review email via Resend: The shots.example domain is not verified",
    );
  });

  it("throws when Resend returns neither data nor error", async () => {
    sendMock.mockResolvedValue({ data: null, error: null });
    await expect(sendReviewEmail(input)).rejects.toThrow("no response data");
  });
});
