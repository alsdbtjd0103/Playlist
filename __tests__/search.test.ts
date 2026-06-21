import { matchesSearch, getChoseong, extractChoseong } from '../lib/search';

describe('getChoseong', () => {
  it('한글 음절에서 초성 추출', () => {
    expect(getChoseong('방')).toBe('ㅂ');
    expect(getChoseong('구')).toBe('ㄱ');
    expect(getChoseong('석')).toBe('ㅅ');
  });

  it('비한글은 원본 유지', () => {
    expect(getChoseong('a')).toBe('a');
    expect(getChoseong('1')).toBe('1');
    expect(getChoseong(' ')).toBe(' ');
  });

  it('이미 자음이면 그대로', () => {
    expect(getChoseong('ㅂ')).toBe('ㅂ');
  });
});

describe('extractChoseong', () => {
  it('한글 문장의 모든 초성 추출', () => {
    expect(extractChoseong('방구석')).toBe('ㅂㄱㅅ');
    expect(extractChoseong('플레이리스트')).toBe('ㅍㄹㅇㄹㅅㅌ');
  });

  it('한글과 비한글 혼합', () => {
    expect(extractChoseong('방 구석 ABC')).toBe('ㅂ ㄱㅅ ABC');
  });
});

describe('matchesSearch', () => {
  it('정확 매칭', () => {
    expect(matchesSearch('방구석', '방구석')).toBe(true);
  });

  it('부분 매칭', () => {
    expect(matchesSearch('방구석 플레이리스트', '플레이')).toBe(true);
  });

  it('검색어 trim', () => {
    expect(matchesSearch('방구석', '  방구석  ')).toBe(true);
  });

  it('검색어 내부 공백 무시', () => {
    expect(matchesSearch('방구석', '방 구 석')).toBe(true);
  });

  it('대상 내부 공백 무시', () => {
    expect(matchesSearch('방 구 석', '방구석')).toBe(true);
  });

  it('초성 전체 매칭', () => {
    expect(matchesSearch('방구석', 'ㅂㄱㅅ')).toBe(true);
  });

  it('초성 부분 매칭', () => {
    expect(matchesSearch('방구석 플레이리스트', 'ㅍㄹㅇ')).toBe(true);
  });

  it('초성 불일치', () => {
    expect(matchesSearch('방구석', 'ㅂㄱㅈ')).toBe(false);
  });

  it('대소문자 무관', () => {
    expect(matchesSearch('Hello', 'HELLO')).toBe(true);
  });

  it('빈 검색어는 모두 매칭', () => {
    expect(matchesSearch('방구석', '')).toBe(true);
  });

  it('공백만 있는 검색어도 모두 매칭', () => {
    expect(matchesSearch('방구석', '   ')).toBe(true);
  });

  it('자음+음절 혼합은 일반 매칭으로 처리되어 매치 안 됨', () => {
    expect(matchesSearch('방구석', 'ㅂ구')).toBe(false);
  });
});
