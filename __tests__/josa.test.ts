import { hasBatchim, withObjectParticle } from '../lib/josa';

describe('목적격 조사', () => {
  it.each([
    ['밤편지', '를'],
    ['좋은날', '을'],
    ['버전 #3', '을'],
    ['버전 #2', '를'],
    ['Cc', '를'],
    ['Hello', '를'],
    ['Dream', '을'],
  ])('%s → %s', (word, particle) => {
    expect(withObjectParticle(word).endsWith(particle)).toBe(true);
  });

  it('감싼 표기 뒤에 조사를 붙인다', () => {
    expect(withObjectParticle('밤편지', '「밤편지」')).toBe('「밤편지」를');
    expect(hasBatchim('')).toBe(false);
  });
});
