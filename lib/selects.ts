import { Prisma } from "@/app/generated/prisma/client";

// Reusable "select" objects. Route files may only export GET/POST/...,
// so shared query pieces live here.

// password is never returned
export const userPublicFields = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  privileges: true,
  divisions: true,
  profileImage: true,
  createdAt: true,
  lastLogin: true,
} satisfies Prisma.UserSelect;

export const staffNameFields = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

export const customerSummaryFields = {
  id: true,
  reference: true,
  firstName: true,
  lastName: true,
  companyName: true,
  email: true,
  phone: true,
  country: true,
} satisfies Prisma.CustomerSelect;
