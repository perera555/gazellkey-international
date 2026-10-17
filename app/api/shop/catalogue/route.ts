import { NextRequest, NextResponse } from "next/server";
import { getShopCatalogue } from "@/lib/shop-catalogue";
import { SHOP_KINDS, SHOP_SORTS, ShopKind, ShopSort } from "@/types/dto/shop";
import { ApiError, handleError } from "@/utils/handleError";
import { searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

function priceParam(request: NextRequest, name: string) {
  const value = searchParam(request, name);
  if (value == undefined) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new ApiError(400, `${name} must be a positive number`);
  }
  return number;
}

function oneOf<T extends string>(request: NextRequest, name: string, allowed: readonly T[]) {
  const value = searchParam(request, name);
  if (value != undefined && !allowed.includes(value as T)) {
    throw new ApiError(400, `${name} must be one of: ${allowed.join(", ")}`);
  }
  return value as T | undefined;
}

// Public: everything that can be bought online (website Shop page)
// /api/shop/catalogue?kind=SHOP&category=Gifts&search=tea&minPrice=500&maxPrice=5000
//   &currency=LKR&onSale=true&inStock=true&sort=price-asc&pageNumber=2&pageSize=24
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const result = await getShopCatalogue(
      {
        search: searchParam(request, "search"),
        kind: oneOf<ShopKind>(request, "kind", SHOP_KINDS),
        category: searchParam(request, "category"),
        minPrice: priceParam(request, "minPrice"),
        maxPrice: priceParam(request, "maxPrice"),
        currency: searchParam(request, "currency")?.toUpperCase(),
        onSale: searchParam(request, "onSale") == "true",
        inStock: searchParam(request, "inStock") == "true",
        sort: oneOf<ShopSort>(request, "sort", SHOP_SORTS) ?? "featured",
      },
      params,
    );

    return NextResponse.json({
      message: "Shop catalogue fetched successfully",
      data: result.items,
      categories: result.categories,
      currencies: result.currencies,
      pagination: buildPagination(params, result.totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
