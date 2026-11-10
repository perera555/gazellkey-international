import { z } from "zod";
import { Division, Role, UserStatus } from "@/app/generated/prisma/enums";
import { ALL_PRIVILEGES } from "@/lib/privileges";

export const LoginRequestSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().default(false), // "Remember me": stay signed in for 30 days
});

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters"); // bcrypt limit

// Public sign-up. Always creates a CUSTOMER; role/privileges are rejected.
export const UserRegistrationRequestSchema = z
  .object({
    email: z.email().trim().toLowerCase(),
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    password: passwordSchema,
    phone: z.string().trim().max(20).optional(),
  })
  .strict(); // unknown keys such as "role" cause a 400

// Admin creates a staff / finance / admin / supplier account
export const UserCreateByAdminRequestSchema = UserRegistrationRequestSchema.extend(
  {
    role: z.enum(Role),
    divisions: z.array(z.enum(Division)).default([]),
    privileges: z.array(z.enum(ALL_PRIVILEGES)).optional(), // default = role privileges
  },
);

export const UserSelfUpdateRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().min(1).max(50).optional(),
    phone: z.string().trim().max(20).optional(),
  })
  // role, status, privileges, email, password and profileImage are not
  // allowed (the photo changes only through POST /api/auth/photo, so nobody
  // can point it at someone else's stored file)
  .strict();

export const UserUpdatedByAdminRequestSchema = z
  .object({
    email: z.email().trim().toLowerCase().optional(),
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().min(1).max(50).optional(),
    phone: z.string().trim().max(20).optional(),
    profileImage: z.string().trim().optional(),
    role: z.enum(Role).optional(),
    status: z.enum(UserStatus).optional(),
    privileges: z.array(z.enum(ALL_PRIVILEGES)).optional(),
    divisions: z.array(z.enum(Division)).optional(),
  })
  .strict(); // id and password cannot be changed here

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type UserRegistrationRequest = z.infer<
  typeof UserRegistrationRequestSchema
>;
export type UserUpdatedByAdminRequest = z.infer<
  typeof UserUpdatedByAdminRequestSchema
>;
