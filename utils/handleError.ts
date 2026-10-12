import { NextResponse } from "next/server";
import z from "zod";
import { Prisma } from "@/app/generated/prisma/client";

// Throw this anywhere inside a route (also inside a transaction)
// to stop and return a clean error response.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return NextResponse.json(
      {
        message: issue
          ? `${field ? field + ": " : ""}${issue.message}`
          : "Invalid data provided.",
      },
      { status: 400 },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code == "P2002") {
      return NextResponse.json(
        { message: "A record with this value already exists." },
        { status: 409 },
      );
    }
    if (error.code == "P2025") {
      return NextResponse.json(
        { message: "Record not found." },
        { status: 404 },
      );
    }
    if (error.code == "P2003") {
      return NextResponse.json(
        { message: "A linked record does not exist." },
        { status: 400 },
      );
    }
  }

  console.error(error);
  return NextResponse.json(
    { message: "Internal server error." },
    { status: 500 },
  );
}

export function notFound(name = "Record") {
  return NextResponse.json({ message: `${name} not found.` }, { status: 404 });
}
