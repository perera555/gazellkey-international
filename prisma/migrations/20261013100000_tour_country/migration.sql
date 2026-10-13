-- Tours get a country, so visitors can search the Travel page by country
ALTER TABLE "TourPackage" ADD COLUMN "country" TEXT;

CREATE INDEX "TourPackage_country_idx" ON "TourPackage"("country");
