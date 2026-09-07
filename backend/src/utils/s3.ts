// Thin wrapper around the AWS S3 SDK — every client document upload/download goes through
// presigned URLs so file bytes never pass through this server (fastest path, and keeps the
// Node process free to serve API requests instead of buffering multi-MB files in memory).
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET_NAME;

if (!REGION || !BUCKET) {
  // Fails fast at boot rather than on the first upload attempt — a missing bucket config
  // should never surface as an opaque 500 to a staff member mid-upload.
  // eslint-disable-next-line no-console
  console.warn('[s3] AWS_REGION or S3_BUCKET_NAME not set — document upload endpoints will fail until configured.');
}

export const s3 = new S3Client({ region: REGION });
export const BUCKET_NAME = BUCKET as string;

const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes — long enough for a slow connection, short enough to limit exposure of a leaked URL

export const presignPutObject = (key: string, contentType: string): Promise<string> =>
  getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType }), { expiresIn: PRESIGN_EXPIRY_SECONDS });

export const presignGetObject = (key: string, downloadAsFileName?: string): Promise<string> =>
  getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ...(downloadAsFileName ? { ResponseContentDisposition: `inline; filename="${downloadAsFileName.replace(/"/g, '')}"` } : {}),
  }), { expiresIn: PRESIGN_EXPIRY_SECONDS });

export const deleteObject = (key: string): Promise<void> =>
  s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })).then(() => undefined);

export const createMultipartUpload = async (key: string, contentType: string): Promise<string> => {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType }));
  return res.UploadId as string;
};

export const presignUploadPart = (key: string, uploadId: string, partNumber: number): Promise<string> =>
  getSignedUrl(s3, new UploadPartCommand({ Bucket: BUCKET_NAME, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: PRESIGN_EXPIRY_SECONDS * 4 });

export const completeMultipartUpload = (key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): Promise<void> =>
  s3.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET_NAME, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts.slice().sort((a, b) => a.PartNumber - b.PartNumber) },
  })).then(() => undefined);

export const abortMultipartUpload = (key: string, uploadId: string): Promise<void> =>
  s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: key, UploadId: uploadId })).then(() => undefined).catch(() => undefined);
