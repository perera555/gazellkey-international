import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { EntityType, LeadershipRole, PublishStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { cleanTeamInput, publicTeamView } from "@/lib/team";
import { TeamMemberCreateRequestSchema } from "@/types/dto/team";
import { getUser, hasPrivilege, requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Directors, shareholders and managers: /api/team?role=MANAGER
// Visitors get published people in the public view (email; phone for
// managers only; no shareholdings). Staff with content:edit see everything.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = hasPrivilege(user, PRIVILEGES.CONTENT_EDIT) && searchParam(request, "view") != "public";
    const role = enumParam(request, "role", LeadershipRole);
    const search = searchParam(request, "search");

    const where: Prisma.TeamMemberWhereInput = {
      status: isEditor ? enumParam(request, "status", PublishStatus) : PublishStatus.PUBLISHED,
      roles: role ? { has: role } : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { position: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [members, totalCount] = await Promise.all([
      prisma.teamMember.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.teamMember.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Team fetched successfully",
      data: isEditor ? members : members.map(publicTeamView),
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.CONTENT_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = cleanTeamInput(TeamMemberCreateRequestSchema.parse(await request.json()));
    const member = await prisma.teamMember.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "team_member.created",
      entityType: EntityType.TEAM_MEMBER,
      entityId: member.id,
    });

    return NextResponse.json({ message: "Person added successfully", data: member }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
