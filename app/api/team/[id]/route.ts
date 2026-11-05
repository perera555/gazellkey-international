import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType, PublishStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { cleanTeamInput, publicTeamView } from "@/lib/team";
import { TeamMemberUpdateRequestSchema } from "@/types/dto/team";
import { getUser, hasPrivilege, requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  try {
    const user = await getUser(request);
    const isEditor = hasPrivilege(user, PRIVILEGES.CONTENT_EDIT);
    const member = await prisma.teamMember.findUnique({ where: { id: id } });
    if (member == null || (member.status != PublishStatus.PUBLISHED && !isEditor)) {
      return notFound("Person");
    }
    return NextResponse.json({ message: "Person fetched", data: isEditor ? member : publicTeamView(member) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CONTENT_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const existing = await prisma.teamMember.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Person");
    }
    const parsed = TeamMemberUpdateRequestSchema.parse(await request.json());
    // re-apply the phone / shareholding rules whenever roles or those fields change
    const body = cleanTeamInput(
      {
        ...parsed,
        phone: parsed.phone !== undefined ? parsed.phone : existing.phone,
        shareholding: parsed.shareholding !== undefined ? parsed.shareholding : existing.shareholding == null ? null : Number(existing.shareholding),
      },
      existing.roles,
    );
    const member = await prisma.teamMember.update({ where: { id: id }, data: body });

    await audit({
      userId: auth.user.id,
      action: "team_member.updated",
      entityType: EntityType.TEAM_MEMBER,
      entityId: id,
      details: { changedFields: Object.keys(parsed) },
    });
    return NextResponse.json({ message: "Person updated", data: member });
  } catch (error) {
    return handleError(error);
  }
}

// Soft delete: archived (hidden from the website, can be restored)
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CONTENT_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    await prisma.teamMember.update({ where: { id: id }, data: { status: PublishStatus.ARCHIVED } });
    await audit({
      userId: auth.user.id,
      action: "team_member.archived",
      entityType: EntityType.TEAM_MEMBER,
      entityId: id,
    });
    return NextResponse.json({ message: "Person removed from the website" });
  } catch (error) {
    return handleError(error);
  }
}
