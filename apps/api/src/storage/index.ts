import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireConfig } from "../config.js";

const DEFAULT_PRESIGN_EXPIRY_SECONDS = 300;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: requireConfig("BUCKET_ENDPOINT"),
      region: requireConfig("BUCKET_REGION"),
      credentials: {
        accessKeyId: requireConfig("BUCKET_ACCESS_KEY_ID"),
        secretAccessKey: requireConfig("BUCKET_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: true,
    });
  }
  return client;
}

function bucket(): string {
  return requireConfig("BUCKET_NAME");
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function presignGet(
  key: string,
  opts?: { expiresInSeconds?: number; downloadFilename?: string },
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ...(opts?.downloadFilename !== undefined && {
      ResponseContentDisposition: `attachment; filename="${sanitizeFilename(opts.downloadFilename)}"`,
    }),
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: opts?.expiresInSeconds ?? DEFAULT_PRESIGN_EXPIRY_SECONDS,
  });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/["\\\r\n]/g, "_");
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === "NotFound" || err.$metadata?.httpStatusCode === 404;
}
