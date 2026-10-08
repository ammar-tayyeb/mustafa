import { describe, expect, it } from 'vitest';
import { computeInvoiceTotals, computeInvoiceItem, fromInt, toInt } from './money.js';

describe('money helpers', () => {
  it('converts decimal values to whole IQD values', () => {
    expect(toInt(12.34)).toBe(12);
    expect(fromInt(1234)).toBe(1234);
  });

  it('computes invoice totals from stored integer amounts', () => {
    const totals = computeInvoiceTotals(
      [
        { final_amount: 1250 },
        { final_amount: 3750 },
      ],
      20,
    );

    expect(totals).toEqual({
      total_final: 5000,
      paid_amount: 20,
      remaining: 4980,
    });
  });

  it('computes invoice item totals using whole-unit arithmetic', () => {
    const item = computeInvoiceItem({
      grossWeight: 10,
      basketCount: 2,
      basketWeightEach: 0.5,
      price: 3.5,
      basketPrice: 125,
      commissionRate: 5,
      porterage: 1,
      manualFinal: 30.48,
    });

    expect(item.basket_price_total).toBe(250);
    expect(item.final_amount).toBe(30);
    expect(item.display.finalAmount).toBe(30);
  });

  it('rounds automatic final amounts down to the nearest 250', () => {
    const item = computeInvoiceItem({
      grossWeight: 100,
      basketCount: 0,
      basketWeightEach: 0.5,
      price: 1254,
      basketPrice: 0,
      commissionRate: 0,
      porterage: 0,
    });

    expect(item.final_amount).toBe(125250);
    expect(item.display.finalAmount).toBe(125250);
  });

  it('rounds commission amounts down to the nearest 250 as well', () => {
    const item = computeInvoiceItem({
      grossWeight: 100,
      basketCount: 0,
      basketWeightEach: 0.5,
      price: 1000,
      basketPrice: 0,
      commissionRate: 1,
      porterage: 0,
    });

    expect(item.commission_value).toBe(1000);
    expect(item.display.commissionValue).toBe(1000);
  });

  it('uses percentage commission for الرگي like every other material', () => {
    const item = computeInvoiceItem({
      productName: 'الرگي',
      grossWeight: 20,
      basketCount: 0,
      price: 1000,
      commissionRate: 50,
    });

    expect(item.commission_value).toBe(10000);
  });

  it('uses weight-based porterage for الرگي', () => {
    const item = computeInvoiceItem({
      productName: 'الرگي',
      grossWeight: 20,
      basketCount: 0,
      basketPrice: 999,
      porterage: 1,
    });

    expect(item.porterage).toBe(300);
  });

  it('keeps a manually entered porterage amount instead of multiplying it again', () => {
    const item = computeInvoiceItem({
      productName: 'تفاح',
      grossWeight: 20,
      basketCount: 0,
      porterage: 250,
    });

    expect(item.porterage).toBe(250);
  });
});
