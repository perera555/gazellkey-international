import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { isprivileged } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { searchParam } from "@/utils/params";

// Website content blocks: banners, home page text, about page ... (FR-SH-13)
// /api/content?prefix=home.  -> all blocks whose key starts with "home."
// Visitors see PUBLISHED blocks; content editors see all.
export async function GET(request: NextRequest) {
  try {
    const isEditor = await isprivileged(request, PRIVILEGES.CONTENT_EDIT);
    const prefix = searchParam(request, "prefix");

    const content = await prisma.siteContent.findMany({
      where: {
        status: isEditor ? undefined : PublishStatus.PUBLISHED,
        key: prefix ? { startsWith: prefix } : undefined,
      },
      orderBy: { key: "asc" },
    });

    return NextResponse.json({ message: "Content fetched", data: content });
  } catch (error) {
    return handleError(error);
  }
}
