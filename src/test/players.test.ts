import { describe, expect, it } from 'vitest';
import { parsePlayerList } from '../players';

describe('parsePlayerList', () => {
  it('reads names with optional shirt numbers and skips blank lines', () => {
    expect(parsePlayerList('7 Sam Carter\n\n  #10. Jo Reid \nAlex\n3) Kim Lee\n11 - Pat')).toEqual([
      { number: 7, name: 'Sam Carter' },
      { number: 10, name: 'Jo Reid' },
      { name: 'Alex' },
      { number: 3, name: 'Kim Lee' },
      { number: 11, name: 'Pat' },
    ]);
  });
});
