import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES } from "@/lib/privileges";
import { TEAM_PHOTO_FOLDER } from "@/lib/team";
import { saveFile } from "@/lib/storage";
import { requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";

// Staff upload a photo for a director / manager (multipart "file").
// Returns the address to store in the person's "photo" field.
export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.CONTENT_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size == 0) {
      throw new ApiError(400, "file: Please choose a photo.");
    }
    const key = await saveFile(file, { folder: TEAM_PHOTO_FOLDER, imagesOnly: true });
    const name = key.slice(TEAM_PHOTO_FOLDER.length + 1);
    return NextResponse.json({ message: "Photo uploaded", data: { url: `/api/team/photos/${name}` } }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
