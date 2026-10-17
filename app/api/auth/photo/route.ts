import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  MAX_PHOTO_SIZE,
  PHOTO_TYPES,
  photoUrlOf,
  UPLOAD_PREFIX,
  uploadedPhotoKey,
} from "@/lib/profilePhoto";
import { deleteStoredFile, saveFile } from "@/lib/storage";
import { requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";

const DEFAULT_IMAGE = "images/default-profile.png";

// POST /api/auth/photo - the signed-in user sets their own profile photo
// (multipart/form-data with "file": JPG, PNG or WEBP, max 5 MB)
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  let storageKey: string | null = null;
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size == 0) {
      throw new ApiError(400, "Choose a photo to upload.");
    }
    if (!PHOTO_TYPES.includes(file.type)) {
      throw new ApiError(400, "Only JPG, PNG and WEBP photos are allowed.");
    }
    if (file.size > MAX_PHOTO_SIZE) {
      throw new ApiError(400, "Photo is larger than 5 MB.");
    }
    storageKey = await saveFile(file); // also checks the real file content

    const previous = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { profileImage: true },
    });
    const user = await prisma.user.update({
      where: { id: auth.user.id },
      data: { profileImage: UPLOAD_PREFIX + storageKey },
      select: { id: true, profileImage: true, updatedAt: true },
    });

    const oldKey = previous ? uploadedPhotoKey(previous.profileImage) : null;
    if (oldKey) {
      await deleteStoredFile(oldKey);
    }

    return NextResponse.json({ message: "Photo updated", photoUrl: photoUrlOf(user) });
  } catch (error) {
    if (storageKey) {
      await deleteStoredFile(storageKey); // do not leave an orphan file
    }
    return handleError(error);
  }
}

// DELETE /api/auth/photo - remove the signed-in user's photo
export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const previous = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { profileImage: true },
    });
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { profileImage: DEFAULT_IMAGE },
    });
    const oldKey = previous ? uploadedPhotoKey(previous.profileImage) : null;
    if (oldKey) {
      await deleteStoredFile(oldKey);
    }
    return NextResponse.json({ message: "Photo removed", photoUrl: null });
  } catch (error) {
    return handleError(error);
  }
}
