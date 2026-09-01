import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.BUCKET_ENDPOINT = "https://storage.railway.test";
process.env.BUCKET_NAME = "shots-bucket";
process.env.BUCKET_ACCESS_KEY_ID = "test-access-key";
process.env.BUCKET_SECRET_ACCESS_KEY = "test-secret-key";
process.env.BUCKET_REGION = "auto";

type StorageModule = typeof import("../src/storage/index.js");
type S3Module = typeof import("@aws-sdk/client-s3");

let storage: StorageModule;
let s3: S3Module;

beforeAll(async () => {
  vi.resetModules();
  s3 = await import("@aws-sdk/client-s3");
  storage = await import("../src/storage/index.js");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("presignGet (offline — presigning is pure crypto)", () => {
  it("returns a path-style URL on the bucket endpoint containing bucket and key", async () => {
    const url = new URL(await storage.presignGet("assets/some-uuid"));

    expect(url.host).toBe("storage.railway.test");
    expect(url.pathname).toBe("/shots-bucket/assets/some-uuid");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("defaults to a 300s expiry", async () => {
    const url = new URL(await storage.presignGet("assets/some-uuid"));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("honors a custom expiry", async () => {
    const url = new URL(await storage.presignGet("assets/some-uuid", { expiresInSeconds: 60 }));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("omits response-content-disposition unless a download filename is requested", async () => {
    const url = new URL(await storage.presignGet("assets/some-uuid"));
    expect(url.searchParams.get("response-content-disposition")).toBeNull();
  });

  it("adds attachment disposition with the filename when downloadFilename is set", async () => {
    const url = new URL(
      await storage.presignGet("assets/some-uuid", { downloadFilename: "HG-002_approved-01.jpg" }),
    );

    expect(url.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="HG-002_approved-01.jpg"',
    );
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});

describe("objectExists", () => {
  it("returns true when HeadObject succeeds", async () => {
    const send = vi
      .spyOn(s3.S3Client.prototype, "send")
      .mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } } as never);

    await expect(storage.objectExists("assets/known")).resolves.toBe(true);

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(s3.HeadObjectCommand);
    expect((command as InstanceType<typeof s3.HeadObjectCommand>).input).toEqual({
      Bucket: "shots-bucket",
      Key: "assets/known",
    });
  });

  it("maps NotFound to false", async () => {
    const notFound = Object.assign(new Error("NotFound"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    vi.spyOn(s3.S3Client.prototype, "send").mockRejectedValueOnce(notFound as never);

    await expect(storage.objectExists("assets/missing")).resolves.toBe(false);
  });

  it("rethrows non-404 errors", async () => {
    const forbidden = Object.assign(new Error("Forbidden"), {
      name: "Forbidden",
      $metadata: { httpStatusCode: 403 },
    });
    vi.spyOn(s3.S3Client.prototype, "send").mockRejectedValueOnce(forbidden as never);

    await expect(storage.objectExists("assets/secret")).rejects.toThrow("Forbidden");
  });
});

describe("putObject", () => {
  it("sends a PutObjectCommand with key, body, and content type", async () => {
    const send = vi
      .spyOn(s3.S3Client.prototype, "send")
      .mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } } as never);

    const body = Buffer.from("fake-image-bytes");
    await storage.putObject("assets/new-uuid", body, "image/jpeg");

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(s3.PutObjectCommand);
    expect((command as InstanceType<typeof s3.PutObjectCommand>).input).toEqual({
      Bucket: "shots-bucket",
      Key: "assets/new-uuid",
      Body: body,
      ContentType: "image/jpeg",
    });
  });
});
