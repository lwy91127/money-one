import { describe, expect, it } from 'vitest';
import { addInstrumentPosition } from '../miniprogram/services/store';

describe('store service', () => {
  it('rejects adding an instrument position to a missing account', () => {
    expect(() =>
      addInstrumentPosition({
        accountId: 'account_not_exists',
        instrument: {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          market: 'US',
          currency: 'USD',
          kind: 'stock'
        },
        units: '1',
        price: '100'
      })
    ).toThrow('Account not found.');
  });
});
