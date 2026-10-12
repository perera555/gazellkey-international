import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/utils/handleError";

// Files are kept OUTSIDE /public so nobody can download them without
// going through the access check in /api/documents/[id]/download.
// To move to S3 / Cloudflare R2 later, only this file needs to change (NFR-11).
const STORAGE_DIR =
  process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Checks the real file content, not just the name the browser sent (NFR-04)
function matchesSignature(bytes: Uint8Array, mimeType: string) {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] == byte);

  switch (mimeType) {
    case "application/pdf":
      return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47);
    case "image/webp":
      return (
        startsWith(0x52, 0x49, 0x46, 0x46) && // RIFF
        String.fromCharCode(...bytes.slice(8, 12)) == "WEBP"
      );
    default:
      return false;
  }
}

export async function saveFile(file: File) {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw new ApiError(400, "Only PDF, JPG, PNG and WEBP files are allowed.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ApiError(400, "File is larger than 10 MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(bytes, file.type)) {
    throw new ApiError(400, "File content does not match its type.");
  }

  const now = new Date();
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const storageKey = `${folder}/${randomUUID()}${extension}`;

  await mkdir(path.join(STORAGE_DIR, folder), { recursive: true });
  await writeFile(path.join(STORAGE_DIR, storageKey), bytes);

  return storageKey;
}

function resolveKey(storageKey: string) {
  const fullPath = path.resolve(STORAGE_DIR, storageKey);
  if (!fullPath.startsWith(path.resolve(STORAGE_DIR) + path.sep)) {
    throw new ApiError(400, "Invalid file key."); // blocks ../../ tricks
  }
  return fullPath;
}

export function readStoredFile(storageKey: string) {
  return readFile(resolveKey(storageKey));
}

export async function deleteStoredFile(storageKey: string) {
  try {
    await unlink(resolveKey(storageKey));
  } catch (error) {
    console.error("Could not delete stored file", storageKey, error);
  }
}
