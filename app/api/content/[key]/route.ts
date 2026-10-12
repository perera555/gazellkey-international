import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { SiteContentRequestSchema } from "@/types/dto/document";
import { isprivileged, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";

type KeyContext = { params: Promise<{ key: string }> };

export async function GET(request: NextRequest, { params }: KeyContext) {
  const { key } = await params;

  const content = await prisma.siteContent.findUnique({ where: { key: key } });
  if (content == null) {
    return notFound("Content");
  }
  if (
    content.status != PublishStatus.PUBLISHED &&
    !(await isprivileged(request, PRIVILEGES.CONTENT_EDIT))
  ) {
    return notFound("Content");
  }
  return NextResponse.json({ message: "Content fetched", data: content });
}

// Create or replace a content block, e.g. PUT /api/content/home.hero
export async function PUT(request: NextRequest, { params }: KeyContext) {
  const { key } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CONTENT_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(key)) {
      throw new ApiError(400, "Key may contain a-z, 0-9, dots and dashes.");
    }
    const body = SiteContentRequestSchema.parse(await request.json());

    const content = await prisma.siteContent.upsert({
      where: { key: key },
      create: { key: key, ...body, updatedById: auth.user.id },
      update: { ...body, updatedById: auth.user.id },
    });

    await audit({
      userId: auth.user.id,
      action: "content.saved",
      entityType: "SITE_CONTENT",
      entityId: content.id,
      details: { key: key, status: content.status },
    });

    return NextResponse.json({ message: "Content saved", data: content });
  } catch (error) {
    return handleError(error);
  }
}
