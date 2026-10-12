import { NextRequest } from "next/server";

const MAX_PAGE_SIZE = 100;

function toPositiveInt(value: string | null, fallback: number) {
  const number = parseInt(value || "", 10);
  return Number.isNaN(number) || number < 1 ? fallback : number;
}

export default function getPageInfo(request: NextRequest) {
  const pageNumber = toPositiveInt(
    request.nextUrl.searchParams.get("pageNumber"),
    1,
  );
  const pageSize = Math.min(
    toPositiveInt(request.nextUrl.searchParams.get("pageSize"), 10),
    MAX_PAGE_SIZE,
  );

  return {
    pageNumber: pageNumber,
    pageSize: pageSize,
    skip: (pageNumber - 1) * pageSize,
    take: pageSize,
  };
}

export function buildPagination(
  params: { pageNumber: number; pageSize: number },
  totalCount: number,
) {
  return {
    pageNumber: params.pageNumber,
    pageSize: params.pageSize,
    totalPages: Math.ceil(totalCount / params.pageSize),
    totalCount: totalCount,
  };
}
