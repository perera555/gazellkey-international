import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { isCatalogueEditor } from "@/lib/catalogue";
import { galleryOmit, withImageSrc } from "@/lib/gallery";
import { deleteStoredFile } from "@/lib/storage";
import { GalleryPhotoUpdateSchema } from "@/types/dto/review";
import { requireUser } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Staff: change the title, caption, order or status (DRAFT hides it)
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = GalleryPhotoUpdateSchema.parse(await request.json());
    const existing = await prisma.galleryPhoto.findUnique({ where: { id: id } });
    if (
      existing == null ||
      !isCatalogueEditor(auth.user, existing.division) ||
      (body.division && !isCatalogueEditor(auth.user, body.division))
    ) {
      return notFound("Photo");
    }

    const photo = await prisma.galleryPhoto.update({
      where: { id: id },
      data: body,
      omit: galleryOmit,
    });
    return NextResponse.json({ message: "Photo updated", data: withImageSrc(photo) });
  } catch (error) {
    return handleError(error);
  }
}

// Staff: remove the photo (and the uploaded file) for good
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const existing = await prisma.galleryPhoto.findUnique({ where: { id: id } });
    if (existing == null || !isCatalogueEditor(auth.user, existing.division)) {
      return notFound("Photo");
    }

    await prisma.galleryPhoto.delete({ where: { id: id } });
    if (existing.storageKey) {
      await deleteStoredFile(existing.storageKey);
    }
    await audit({
      userId: auth.user.id,
      action: "gallery.photo_deleted",
      entityType: "GALLERY_PHOTO",
      entityId: id,
      details: { title: existing.title },
    });

    return NextResponse.json({ message: "Photo deleted" });
  } catch (error) {
    return handleError(error);
  }
}
