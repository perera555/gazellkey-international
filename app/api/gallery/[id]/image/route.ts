import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { readStoredFile } from "@/lib/storage";
import { getUser } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

// The uploaded picture of a gallery photo. Published photos are public;
// drafts only for catalogue editors (the admin preview).
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;

  try {
    const photo = await prisma.galleryPhoto.findUnique({ where: { id: id } });
    if (photo == null || photo.storageKey == null || photo.mimeType == null) {
      return notFound("Photo");
    }

    const isPublic = photo.status == PublishStatus.PUBLISHED;
    if (!isPublic && !isCatalogueEditor(await getUser(request), photo.division)) {
      return notFound("Photo");
    }

    const bytes = await readStoredFile(photo.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": photo.mimeType,
        "content-length": String(bytes.length),
        "x-content-type-options": "nosniff",
        // the URL changes (?v=) whenever the photo changes, so cache long
        "cache-control": isPublic ? "public, max-age=604800, immutable" : "private, no-store",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
