ALTER TABLE "Product" ADD COLUMN "fencePostWidth" REAL;
ALTER TABLE "Product" ADD COLUMN "fencePostHeight" REAL;

ALTER TABLE "OrderItem" ADD COLUMN "fencePostWidthSnapshot" REAL;
ALTER TABLE "OrderItem" ADD COLUMN "fencePostHeightSnapshot" REAL;
ALTER TABLE "OrderItem" ADD COLUMN "fenceConfiguredLengthSnapshot" REAL;
