import { Role } from "@/app/generated/prisma/enums";

// Every privilege string the system checks (SRS Section 8 - permission matrix)
export const PRIVILEGES = {
  USERS_READ: "users:read",
  USERS_EDIT: "users:edit",
  CUSTOMERS_READ: "customers:read",
  CUSTOMERS_EDIT: "customers:edit",
  ENQUIRIES_READ: "enquiries:read",
  ENQUIRIES_EDIT: "enquiries:edit",
  APPOINTMENTS_READ: "appointments:read",
  APPOINTMENTS_EDIT: "appointments:edit",
  QUOTATIONS_READ: "quotations:read",
  QUOTATIONS_EDIT: "quotations:edit",
  ORDERS_READ: "orders:read",
  ORDERS_EDIT: "orders:edit",
  PAYMENTS_READ: "payments:read",
  PAYMENTS_CREATE: "payments:create",
  PAYMENTS_CONFIRM: "payments:confirm",
  REFUNDS_CREATE: "refunds:create",
  DOCUMENTS_READ: "documents:read",
  DOCUMENTS_EDIT: "documents:edit",
  DOCUMENTS_RESTRICTED: "documents:restricted", // passports and personal documents
  DOCUMENTS_APPROVE: "documents:approve", // approve / cancel customer uploads (admins)
  CATALOGUE_EDIT: "catalogue:edit",
  TRAVEL_CASES: "travel:cases", // visa, ticket and insurance cases
  EVENTS_REGISTRATIONS: "events:registrations",
  SUPPLIERS_READ: "suppliers:read",
  SUPPLIERS_EDIT: "suppliers:edit",
  SUPPLIER_COST_READ: "supplierCost:read",
  SHIPMENTS_EDIT: "shipments:edit",
  REPORTS_READ: "reports:read",
  AUDIT_READ: "audit:read",
  CONTENT_EDIT: "content:edit",
  REVIEWS_MODERATE: "reviews:moderate", // hide / delete customer reviews (admins)
} as const;

export type Privilege = (typeof PRIVILEGES)[keyof typeof PRIVILEGES];

export const ALL_PRIVILEGES = Object.values(PRIVILEGES) as Privilege[];

const P = PRIVILEGES;

// Privileges given automatically when a user gets a role.
// An admin can still add or remove single privileges per user.
export const ROLE_DEFAULT_PRIVILEGES: Record<Role, Privilege[]> = {
  CUSTOMER: [],
  SUPPLIER: [],
  STAFF: [
    P.CUSTOMERS_READ,
    P.CUSTOMERS_EDIT,
    P.ENQUIRIES_READ,
    P.ENQUIRIES_EDIT,
    P.APPOINTMENTS_READ,
    P.APPOINTMENTS_EDIT,
    P.QUOTATIONS_READ,
    P.QUOTATIONS_EDIT,
    P.ORDERS_READ,
    P.ORDERS_EDIT,
    P.PAYMENTS_READ,
    P.PAYMENTS_CREATE,
    P.DOCUMENTS_READ,
    P.DOCUMENTS_EDIT,
    P.CATALOGUE_EDIT,
    P.TRAVEL_CASES,
    P.EVENTS_REGISTRATIONS,
    P.SUPPLIERS_READ,
    P.SHIPMENTS_EDIT,
    P.REPORTS_READ,
  ],
  FINANCE: [
    P.CUSTOMERS_READ,
    P.ENQUIRIES_READ,
    P.APPOINTMENTS_READ,
    P.QUOTATIONS_READ,
    P.ORDERS_READ,
    P.PAYMENTS_READ,
    P.PAYMENTS_CREATE,
    P.PAYMENTS_CONFIRM,
    P.REFUNDS_CREATE,
    P.DOCUMENTS_READ,
    P.SUPPLIERS_READ,
    P.SUPPLIER_COST_READ,
    P.REPORTS_READ,
    P.AUDIT_READ,
  ],
  ADMIN: ALL_PRIVILEGES,
};
