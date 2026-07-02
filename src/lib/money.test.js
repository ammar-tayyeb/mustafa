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
      commissionRate: 5,
      porterage: 1,
      manualFinal: 30.48,
    });

    expect(item.final_amount).toBe(30);
    expect(item.display.finalAmount).toBe(30);
  });
});
