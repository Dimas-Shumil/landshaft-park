-- Store the administrator-defined swatch color instead of guessing it on the client.
ALTER TABLE "ProductVariant" ADD COLUMN "colorHex" TEXT;
