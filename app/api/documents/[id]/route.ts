import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES } from "@/lib/privileges";
import { deleteStoredFile } from "@/lib/storage";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Download is at /api/documents/[id]/download
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.DOCUMENTS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const document = await prisma.document.findUnique({ where: { id: id } });
    if (
      document == null ||
      (document.division && !canAccessDivision(auth.user, document.division))
    ) {
      return notFound("Document");
    }

    await prisma.document.delete({ where: { id: id } });
    await deleteStoredFile(document.storageKey);

    await audit({
      userId: auth.user.id,
      action: "document.deleted",
      entityType: document.entityType,
      entityId: document.entityId,
      details: { documentId: id, title: document.title, type: document.type },
    });

    return NextResponse.json({ message: "Document deleted" });
  } catch (error) {
    return handleError(error);
  }
}
