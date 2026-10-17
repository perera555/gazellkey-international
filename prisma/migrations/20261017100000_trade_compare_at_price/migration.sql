-- Import / Export products: labelled ("was") price shown crossed out
ALTER TABLE "TradeProduct" ADD COLUMN "compareAtPrice" DECIMAL(14,2);
