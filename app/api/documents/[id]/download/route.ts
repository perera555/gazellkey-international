import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DocumentAccess } from "@/app/generated/prisma/enums";
import { getCustomerForUser } from "@/lib/customers";
import { canViewDocument } from "@/lib/documents";
import { readStoredFile } from "@/lib/storage";
import { getUser } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;

  try {
    const document = await prisma.document.findUnique({ where: { id: id } });
    if (document == null) {
      return notFound("Document");
    }

    const user = await getUser(request); // PUBLIC documents need no sign-in
    const customer = user ? await getCustomerForUser(user.id) : null;

    if (!(await canViewDocument(user, document, customer?.id ?? null))) {
      return notFound("Document"); // do not reveal that it exists
    }

    // FR-SH-12: views of restricted documents are audit-logged
    if (document.accessLevel == DocumentAccess.RESTRICTED) {
      await audit({
        userId: user?.id,
        action: "document.restricted_viewed",
        entityType: document.entityType,
        entityId: document.entityId,
        details: { documentId: document.id, type: document.type },
      });
    }

    const file = await readStoredFile(document.storageKey);
    const safeName = document.fileName.replace(/[^\w.\- ]/g, "_");

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(file.length),
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
