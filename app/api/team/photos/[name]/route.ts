import { NextRequest, NextResponse } from "next/server";
import { TEAM_PHOTO_FOLDER } from "@/lib/team";
import { readStoredFile } from "@/lib/storage";
import { notFound } from "@/utils/handleError";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

type NameContext = { params: Promise<{ name: string }> };

// Public: a director / manager photo shown on the website. Only files from
// the team photo folder, and only names this API created, can be read.
export async function GET(_request: NextRequest, { params }: NameContext) {
  const { name } = await params;
  const match = /^[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(name);
  if (match == null) {
    return notFound("Photo");
  }
  try {
    const bytes = await readStoredFile(`${TEAM_PHOTO_FOLDER}/${name}`);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": TYPES[match[1]],
        // the name never changes for a file: a new photo gets a new name
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound("Photo");
  }
}
