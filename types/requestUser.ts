import { Division, Role } from "@/app/generated/prisma/enums";

export interface RequestUserType {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  privileges: string[];
  divisions: Division[];
}
