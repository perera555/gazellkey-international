import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { uploadedPhotoKey } from "@/lib/profilePhoto";
import { readStoredFile } from "@/lib/storage";
import { isStaffUser, requireUser } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// GET /api/users/{id}/photo - an uploaded profile photo.
// Users see their own; staff may see anyone's (e.g. on a customer record).
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }
  if (auth.user.id != id && !isStaffUser(auth.user)) {
    return notFound("Photo");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: id },
      select: { profileImage: true },
    });
    const key = user ? uploadedPhotoKey(user.profileImage) : null;
    const type = key ? MIME_BY_EXTENSION[key.slice(key.lastIndexOf("."))] : undefined;
    if (key == null || type == undefined) {
      return notFound("Photo");
    }

    const bytes = await readStoredFile(key);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": type,
        "content-length": String(bytes.length),
        "x-content-type-options": "nosniff",
        // the address changes (?v=) whenever the photo changes
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
