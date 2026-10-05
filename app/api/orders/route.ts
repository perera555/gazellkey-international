import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    let body = await request.json();

    return NextResponse.json({
        message: "Hello from the orders API route!",
        data: body,
    });

}