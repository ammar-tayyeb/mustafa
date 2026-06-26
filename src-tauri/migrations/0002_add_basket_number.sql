-- Add basket_number to invoice_items
ALTER TABLE invoice_items ADD COLUMN basket_number INTEGER NOT NULL DEFAULT 0;
