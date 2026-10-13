import { Prisma } from "@/app/generated/prisma/client";

export const galleryOmit = { storageKey: true } satisfies Prisma.GalleryPhotoOmit;

type GalleryRow = {
  id: string;
  imageUrl: string | null;
  mimeType: string | null;
  updatedAt: Date;
};

// The picture's address for <img src>: uploaded photos are served by this
// API (the ?v= part makes browsers fetch a new copy after a change)
export function withImageSrc<T extends GalleryRow>(photo: T) {
  return {
    ...photo,
    src: photo.mimeType
      ? `/api/gallery/${photo.id}/image?v=${photo.updatedAt.getTime()}`
      : (photo.imageUrl ?? ""),
  };
}
