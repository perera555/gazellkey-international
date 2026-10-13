import prisma from "@/lib/prisma";
import {
  Division,
  DocumentAccess,
  DocumentApproval,
  DocumentType,
  EntityType,
  Role,
  TradeDirection,
} from "@/app/generated/prisma/enums";
import { RequestUserType } from "@/types/requestUser";
import { canAccessDivision, hasPrivilege } from "@/utils/authentication";
import { PRIVILEGES } from "@/lib/privileges";

// What a document is attached to: who owns it, which division,
// and which staff member is assigned (for passport documents).
export type DocumentOwner = {
  customerId: string | null;
  division: Division | null;
  assignedToId: string | null;
};

const directionToDivision = (direction: TradeDirection) =>
  direction == TradeDirection.IMPORT ? Division.IMPORT : Division.EXPORT;

export async function resolveDocumentOwner(
  entityType: EntityType,
  entityId: string,
): Promise<DocumentOwner | null> {
  const none = { customerId: null, assignedToId: null };

  switch (entityType) {
    case EntityType.CUSTOMER: {
      const record = await prisma.customer.findUnique({ where: { id: entityId } });
      return record && { customerId: record.id, division: null, assignedToId: null };
    }
    case EntityType.ENQUIRY: {
      const record = await prisma.enquiry.findUnique({ where: { id: entityId } });
      return record && {
        customerId: record.customerId,
        division: record.division,
        assignedToId: record.assignedToId,
      };
    }
    case EntityType.QUOTATION: {
      const record = await prisma.quotation.findUnique({ where: { id: entityId } });
      return record && { customerId: record.customerId, division: record.division, assignedToId: null };
    }
    case EntityType.ORDER: {
      const record = await prisma.order.findUnique({ where: { id: entityId } });
      return record && { customerId: record.customerId, division: record.division, assignedToId: null };
    }
    case EntityType.PAYMENT: {
      const record = await prisma.payment.findUnique({
        where: { id: entityId },
        include: { order: true },
      });
      return record && { customerId: record.customerId, division: record.order.division, assignedToId: null };
    }
    case EntityType.VISA_CASE: {
      const record = await prisma.visaCase.findUnique({ where: { id: entityId } });
      return record && { customerId: record.customerId, division: Division.TRAVEL, assignedToId: record.assignedToId };
    }
    case EntityType.TICKET_REQUEST: {
      const record = await prisma.ticketRequest.findUnique({ where: { id: entityId } });
      return record && { customerId: record.customerId, division: Division.TRAVEL, assignedToId: record.assignedToId };
    }
    case EntityType.INSURANCE_REQUEST: {
      const record = await prisma.insuranceRequest.findUnique({ where: { id: entityId } });
      return record && { customerId: record.customerId, division: Division.TRAVEL, assignedToId: record.assignedToId };
    }
    case EntityType.APPOINTMENT: {
      const record = await prisma.appointment.findUnique({ where: { id: entityId } });
      return record && {
        customerId: record.customerId,
        division: record.division,
        assignedToId: record.assignedToId,
      };
    }
    case EntityType.EVENT_REGISTRATION: {
      const record = await prisma.eventRegistration.findUnique({ where: { id: entityId } });
      return record && { customerId: record.customerId, division: Division.EVENTS, assignedToId: null };
    }
    case EntityType.SHIPMENT: {
      const record = await prisma.shipment.findUnique({
        where: { id: entityId },
        include: { order: true },
      });
      return record && { customerId: record.order.customerId, division: record.order.division, assignedToId: null };
    }
    case EntityType.TOUR_PACKAGE: {
      const record = await prisma.tourPackage.findUnique({ where: { id: entityId } });
      return record && { ...none, division: Division.TRAVEL };
    }
    case EntityType.EVENT: {
      const record = await prisma.event.findUnique({ where: { id: entityId } });
      return record && { ...none, division: Division.EVENTS };
    }
    case EntityType.GEM_ITEM: {
      const record = await prisma.gemItem.findUnique({ where: { id: entityId } });
      return record && { ...none, division: Division.GEMS };
    }
    case EntityType.VEHICLE_LISTING: {
      const record = await prisma.vehicleListing.findUnique({ where: { id: entityId } });
      return record && { ...none, division: Division.VEHICLES };
    }
    case EntityType.TRADE_PRODUCT: {
      const record = await prisma.tradeProduct.findUnique({ where: { id: entityId } });
      return record && { ...none, division: directionToDivision(record.direction) };
    }
    case EntityType.SUPPLIER: {
      const record = await prisma.supplier.findUnique({ where: { id: entityId } });
      return record && { ...none, division: null };
    }
  }
}

type DocumentForAccess = {
  accessLevel: DocumentAccess;
  division: Division | null;
  customerId: string | null;
  entityType: EntityType;
  entityId: string;
};

// SRS Section 8:
//  - customers: their own documents, except internal STAFF documents
//  - staff: their divisions; RESTRICTED (passports ...) only for the
//    assigned staff member or users with documents:restricted
//  - finance: all divisions, but no RESTRICTED documents
//  - admin: everything (RESTRICTED views are audited by the caller)
export async function canViewDocument(
  user: RequestUserType | null,
  document: DocumentForAccess,
  customerIdOfUser: string | null,
) {
  if (document.accessLevel == DocumentAccess.PUBLIC) {
    return true;
  }
  if (user == null) {
    return false;
  }
  if (user.role == Role.ADMIN) {
    return true;
  }

  if (hasPrivilege(user, PRIVILEGES.DOCUMENTS_READ)) {
    if (document.division && !canAccessDivision(user, document.division)) {
      return false;
    }
    if (document.accessLevel != DocumentAccess.RESTRICTED) {
      return true;
    }
    if (hasPrivilege(user, PRIVILEGES.DOCUMENTS_RESTRICTED)) {
      return true;
    }
    const owner = await resolveDocumentOwner(
      document.entityType,
      document.entityId,
    );
    return owner?.assignedToId == user.id; // "assigned cases only"
  }

  return (
    customerIdOfUser != null &&
    document.customerId == customerIdOfUser &&
    document.accessLevel != DocumentAccess.STAFF
  );
}

// Document types that need an admin's approval when a CUSTOMER uploads them
// (identity and legal papers). Everything else, and every staff upload, is
// accepted straight away. Keep in step with the admin's lib/documents.ts.
export const APPROVAL_REQUIRED_TYPES: DocumentType[] = [
  DocumentType.PASSPORT,
  DocumentType.VISA_DOCUMENT,
  DocumentType.OWNERSHIP,
  DocumentType.PERMIT,
  DocumentType.CERTIFICATE,
  DocumentType.VALUATION,
];

export function approvalFor(type: DocumentType, uploadedByStaff: boolean) {
  return !uploadedByStaff && APPROVAL_REQUIRED_TYPES.includes(type)
    ? DocumentApproval.PENDING
    : DocumentApproval.NOT_REQUIRED;
}