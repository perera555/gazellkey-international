import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, PublishStatus } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { galleryOmit, withImageSrc } from "@/lib/gallery";
import { deleteStoredFile, saveFile } from "@/lib/storage";
import { GalleryPhotoSchema } from "@/types/dto/review";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public photo gallery of past trips
//   /api/gallery?division=TRAVEL&country=Sri Lanka&place=Ella&pageSize=24
// "places" lists every country / place pair with its photo count, for the
// destination filter. Catalogue editors add &all=true to see draft / archived photos too.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const division = enumParam(request, "division", Division) ?? Division.TRAVEL;
    const user = await getUser(request);
    const showAll =
      searchParam(request, "all") == "true" && isCatalogueEditor(user, division);
    const country = searchParam(request, "country");
    const place = searchParam(request, "place");

    const scope: Prisma.GalleryPhotoWhereInput = {
      division: division,
      status: showAll ? enumParam(request, "status", PublishStatus) : PublishStatus.PUBLISHED,
    };
    const where: Prisma.GalleryPhotoWhereInput = {
      ...scope,
      country: country ? { equals: country, mode: "insensitive" } : undefined,
      place: place ? { equals: place, mode: "insensitive" } : undefined,
    };

    const [photos, totalCount, countries, places] = await Promise.all([
      prisma.galleryPhoto.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: params.skip,
        take: params.take,
        omit: galleryOmit,
      }),
      prisma.galleryPhoto.count({ where }),
      prisma.galleryPhoto.findMany({
        where: { ...scope, country: { not: null } },
        distinct: ["country"],
        orderBy: { country: "asc" },
        select: { country: true },
      }),
      prisma.galleryPhoto.groupBy({
        by: ["country", "place"],
        where: scope,
        _count: { _all: true },
        orderBy: [{ country: "asc" }, { place: "asc" }],
      }),
    ]);

    return NextResponse.json({
      message: "Gallery fetched",
      data: photos.map(withImageSrc),
      countries: countries.map((row) => row.country),
      places: places.map((row) => ({
        country: row.country,
        place: row.place,
        count: row._count._all,
      })),
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Staff add a photo: multipart/form-data with "file" (JPG, PNG, WEBP)
// or an "imageUrl", plus title, caption, place, country, takenAt ...
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  let storageKey: string | null = null;
  try {
    const form = await request.formData();
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value == "string" && value.trim() != "" ? value : undefined;
    };
    const body = GalleryPhotoSchema.parse({
      division: text("division"),
      title: text("title"),
      caption: text("caption"),
      place: text("place"),
      country: text("country"),
      takenAt: text("takenAt"),
      imageUrl: text("imageUrl"),
      sortOrder: text("sortOrder"),
      status: text("status"),
    });

    if (!isCatalogueEditor(auth.user, body.division)) {
      throw new ApiError(403, "You do not have the required privilege to access this resource.");
    }

    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (!hasFile && !body.imageUrl) {
      throw new ApiError(400, "Choose a photo to upload or give an image link.");
    }
    if (hasFile && !file.type.startsWith("image/")) {
      throw new ApiError(400, "Only JPG, PNG and WEBP photos are allowed.");
    }
    if (hasFile) {
      storageKey = await saveFile(file);
    }

    const photo = await prisma.galleryPhoto.create({
      data: {
        ...body,
        imageUrl: hasFile ? null : body.imageUrl,
        storageKey: storageKey,
        mimeType: hasFile ? file.type : null,
        createdById: auth.user.id,
      },
      omit: galleryOmit,
    });

    await audit({
      userId: auth.user.id,
      action: "gallery.photo_added",
      entityType: "GALLERY_PHOTO",
      entityId: photo.id,
      details: { title: photo.title },
    });

    return NextResponse.json(
      { message: "Photo added to the gallery", data: withImageSrc(photo) },
      { status: 201 },
    );
  } catch (error) {
    if (storageKey) {
      await deleteStoredFile(storageKey); // do not leave an orphan file
    }
    return handleError(error);
  }
}
