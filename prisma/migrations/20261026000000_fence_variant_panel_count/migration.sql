ALTER TABLE "ProductVariant" ADD COLUMN "fencePanelCount" INTEGER;
CREATE INDEX "ProductVariant_fencePanelCount_idx" ON "ProductVariant"("fencePanelCount");
