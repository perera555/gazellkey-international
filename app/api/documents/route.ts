import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  DocumentAccess,
  DocumentType,
  EntityType,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { getCustomerForUser } from "@/lib/customers";
import { canViewDocument, resolveDocumentOwner } from "@/lib/documents";
import { deleteStoredFile, saveFile } from "@/lib/storage";
import { DocumentUploadRequestSchema } from "@/types/dto/document";
import {
  canAccessDivision,
  hasPrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";

// Documents of one record: /api/documents?entityType=VISA_CASE&entityId=...
// Only documents the user may see are returned.
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const entityType = enumParam(request, "entityType", EntityType);
    const entityId = searchParam(request, "entityId");
    if (entityType == undefined || entityId == undefined) {
      throw new ApiError(400, "entityType and entityId are required.");
    }

    const documents = await prisma.document.findMany({
      where: { entityType: entityType, entityId: entityId },
      orderBy: { createdAt: "desc" },
      omit: { storageKey: true },
    });

    const customer = await getCustomerForUser(auth.user.id);
    const visible = [];
    for (const document of documents) {
      if (await canViewDocument(auth.user, document, customer?.id ?? null)) {
        visible.push(document);
      }
    }

    return NextResponse.json({ message: "Documents fetched", data: visible });
  } catch (error) {
    return handleError(error);
  }
}

// Upload: multipart/form-data with fields file, entityType, entityId, type,
// title and (staff only) accessLevel.
// Staff upload to records of their divisions; customers upload to their own
// records (e.g. passport copy for a visa case).
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "file is required.");
    }

    const body = DocumentUploadRequestSchema.parse({
      entityType: form.get("entityType"),
      entityId: form.get("entityId"),
      type: form.get("type"),
      title: form.get("title"),
      accessLevel: form.get("accessLevel") || undefined,
    });

    const owner = await resolveDocumentOwner(body.entityType, body.entityId);
    if (owner == null) {
      throw new ApiError(404, "The record to attach to was not found.");
    }

    const isStaff = hasPrivilege(auth.user, PRIVILEGES.DOCUMENTS_EDIT);
    let accessLevel: DocumentAccess;

    if (isStaff) {
      if (owner.division && !canAccessDivision(auth.user, owner.division)) {
        throw new ApiError(403, "You do not work in this division.");
      }
      accessLevel =
        body.accessLevel ??
        (body.type == DocumentType.PASSPORT
          ? DocumentAccess.RESTRICTED
          : owner.customerId
            ? DocumentAccess.CUSTOMER
            : DocumentAccess.STAFF);
    } else {
      const customer = await getCustomerForUser(auth.user.id);
      if (customer == null || owner.customerId != customer.id) {
        throw new ApiError(403, "You can only upload to your own records.");
      }
      // customers cannot choose the access level
      accessLevel =
        body.type == DocumentType.PASSPORT
          ? DocumentAccess.RESTRICTED
          : DocumentAccess.CUSTOMER;
    }

    const storageKey = await saveFile(file);

    try {
      const document = await prisma.document.create({
        data: {
          type: body.type,
          title: body.title,
          fileName: file.name.slice(0, 200),
          storageKey: storageKey,
          mimeType: file.type,
          size: file.size,
          accessLevel: accessLevel,
          division: owner.division,
          entityType: body.entityType,
          entityId: body.entityId,
          customerId: owner.customerId,
          uploadedById: auth.user.id,
        },
        omit: { storageKey: true },
      });

      await audit({
        userId: auth.user.id,
        action: "document.uploaded",
        entityType: body.entityType,
        entityId: body.entityId,
        details: { documentId: document.id, type: body.type, accessLevel },
      });

      return NextResponse.json(
        { message: "Document uploaded", data: document },
        { status: 201 },
      );
    } catch (error) {
      await deleteStoredFile(storageKey); // do not leave orphan files
      throw error;
    }
  } catch (error) {
    return handleError(error);
  }
}
