import { LeadershipRole } from "@/app/generated/prisma/enums";

// Uploaded photos of directors / managers (public, served by /api/team/photos/{name})
export const TEAM_PHOTO_FOLDER = "team-photos";

// Company leadership (directors, shareholders, managers).
// Rule from the owners: a phone number is only ever kept and shown for
// managers. Directors and shareholders are reached by email only.

export function isManager(roles: LeadershipRole[]) {
  return roles.includes(LeadershipRole.MANAGER);
}

// Clean what staff send: no phone unless the person is a manager,
// no shareholding unless they are a shareholder, "" -> null
export function cleanTeamInput<
  T extends { roles?: LeadershipRole[]; phone?: string | null; email?: string | null; shareholding?: number | null },
>(body: T, existingRoles: LeadershipRole[] = []): T {
  const roles = body.roles ?? existingRoles;
  return {
    ...body,
    email: body.email === "" ? null : body.email,
    phone: isManager(roles) ? (body.phone === "" ? null : body.phone) : null,
    shareholding: roles.includes(LeadershipRole.SHAREHOLDER) ? body.shareholding : null,
  };
}

// What visitors may see: never a director's or shareholder's phone, never shareholdings
export function publicTeamView<
  T extends { roles: LeadershipRole[]; phone: string | null; shareholding: unknown; status: unknown; sortOrder: number },
>(member: T) {
  const { phone, shareholding: _shareholding, status: _status, ...visible } = member;
  void _shareholding;
  void _status;
  return { ...visible, phone: isManager(member.roles) ? phone : null };
}
