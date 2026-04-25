import { describe, expect, it, vi } from 'vitest';
import {
  analyzeText,
  buildClipboardText,
  buildSlashInsertionLookup,
  computeReadingStats,
  findSlashInsertionPoint,
  formatDuration,
  groupMarkedTokens,
  loadPersistedState,
  toggleMarkedToken,
  toggleSlashAnchorToken,
  type ReadingToken,
  type PosCategory,
  type KoreanPos,
} from '../lib/reading';

function token(
  id: string,
  text: string,
  pos: KoreanPos,
  options: Partial<ReadingToken> & { posCategory?: PosCategory } = {},
): ReadingToken {
  return {
    id,
    index: 0,
    text,
    normalizedSurface: options.normalizedSurface ?? text,
    dictionaryForm: options.dictionaryForm ?? (options.normalizedSurface ?? text),
    pos,
    posCategory: options.posCategory ?? 'content',
    isMarkable: options.isMarkable ?? true,
    isWordLike: options.isWordLike ?? true,
    offset: options.offset ?? 0,
    length: options.length ?? text.length,
  };
}

describe('analyzeText', () => {
  it('classifies josa as excluded and nouns as markable', async () => {
    const result = await analyzeText('저는 한국어를 공부합니다.');
    const josa = result.tokens.find((item) => item.text === '는');
    const noun = result.tokens.find((item) => item.text === '한국어');

    expect(josa?.isMarkable).toBe(false);
    expect(josa?.posCategory).toBe('excluded');
    expect(noun?.isMarkable).toBe(true);
    expect(noun?.posCategory).toBe('content');
    expect(result.tokens.find((item) => item.text === '합니다')?.dictionaryForm).toBe('하다');
  });
});

describe('computeReadingStats', () => {
  const tokens = [
    token('1', '저', 'Noun'),
    token('2', '는', 'Josa', { isMarkable: false, posCategory: 'excluded' }),
    token('3', '한국어', 'Noun'),
    token('4', '를', 'Josa', { isMarkable: false, posCategory: 'excluded' }),
    token('5', '공부', 'Noun'),
    token('6', '합니다', 'Verb'),
    token('7', '.', 'Punctuation', {
      isMarkable: false,
      posCategory: 'excluded',
      isWordLike: false,
    }),
  ];

  it('excludes functional tokens from unknown-word ratios', () => {
    const stats = computeReadingStats(tokens, new Set(['3', '6']), '저는 한국어를 공부합니다.', 120000, false);

    expect(stats.unknownWordCount).toBe(2);
    expect(stats.totalWords).toBe(3);
    expect(stats.totalCharacters).toBe(12);
    expect(stats.overallUnknownRatioLabel).toBe('50.0%');
    expect(stats.fullTextCharactersPerMinuteLabel).toBe('6.0');
    expect(stats.fullTextWordsPerMinuteLabel).toBe('1.5');
  });

  it('returns dash speeds while timer is still running', () => {
    const stats = computeReadingStats(tokens, new Set(), '', 120000, true);

    expect(stats.totalWords).toBe(0);
    expect(stats.totalCharacters).toBe(0);
    expect(stats.fullTextCharactersPerMinuteLabel).toBe('-');
    expect(stats.fullTextWordsPerMinuteLabel).toBe('-');
  });
});

describe('groupMarkedTokens', () => {
  it('groups repeated marked words by normalized surface', () => {
    const tokens = [
      token('1', '읽습니다', 'Verb', { normalizedSurface: '읽다' }),
      token('2', '읽어요', 'Verb', { normalizedSurface: '읽다' }),
      token('3', '책', 'Noun'),
    ];

    const groups = groupMarkedTokens(tokens, new Set(['1', '2', '3']));

    expect(groups[0]).toMatchObject({
      normalizedSurface: '읽다',
      displayText: '읽다',
      count: 2,
    });
    expect(groups[1]).toMatchObject({
      normalizedSurface: '책',
      displayText: '책',
      count: 1,
    });
  });
});

describe('buildClipboardText', () => {
  it('joins grouped display text with newlines', () => {
    expect(
      buildClipboardText([
        { normalizedSurface: '가다', displayText: '가다', sourceText: '갑니다', count: 1, posLabel: 'Verb' },
        { normalizedSurface: '책', displayText: '책', sourceText: '책', count: 2, posLabel: 'Noun' },
      ]),
    ).toBe('가다\n책\n');
  });

  it('returns an empty string for empty groups', () => {
    expect(buildClipboardText([])).toBe('');
  });
});

describe('toggleMarkedToken', () => {
  it('adds and removes token ids', () => {
    expect(toggleMarkedToken([], 'a')).toEqual(['a']);
    expect(toggleMarkedToken(['a'], 'a')).toEqual([]);
  });
});

describe('toggleSlashAnchorToken', () => {
  it('adds and removes slash anchor ids', () => {
    expect(toggleSlashAnchorToken([], 'a')).toEqual(['a']);
    expect(toggleSlashAnchorToken(['a'], 'a')).toEqual([]);
  });
});

describe('findSlashInsertionPoint', () => {
  it('places a slash at the next space after functional tokens', () => {
    const tokens = [
      token('1', '한국어', 'Noun'),
      token('2', '를', 'Josa', { isMarkable: false, posCategory: 'excluded' }),
      token('3', '읽고', 'Verb', { isMarkable: false, posCategory: 'excluded' }),
      token('4', ' ', 'Space', {
        isMarkable: false,
        posCategory: 'excluded',
        isWordLike: false,
      }),
      token('5', '공부', 'Noun'),
    ];

    expect(findSlashInsertionPoint(tokens, '1')).toEqual({
      type: 'space',
      tokenId: '4',
    });
  });

  it('places a slash after sentence-final punctuation when no space follows', () => {
    const tokens = [
      token('1', '많', 'Adjective'),
      token('2', '다', 'Eomi', { isMarkable: false, posCategory: 'excluded' }),
      token('3', '.', 'Punctuation', {
        isMarkable: false,
        posCategory: 'excluded',
        isWordLike: false,
      }),
    ];

    expect(findSlashInsertionPoint(tokens, '1')).toEqual({
      type: 'punctuation',
      tokenId: '3',
    });
  });

  it('prefers the following space over punctuation when both exist', () => {
    const tokens = [
      token('1', '많', 'Adjective'),
      token('2', '다', 'Eomi', { isMarkable: false, posCategory: 'excluded' }),
      token('3', '.', 'Punctuation', {
        isMarkable: false,
        posCategory: 'excluded',
        isWordLike: false,
      }),
      token('4', ' ', 'Space', {
        isMarkable: false,
        posCategory: 'excluded',
        isWordLike: false,
      }),
      token('5', '다음', 'Noun'),
    ];

    expect(findSlashInsertionPoint(tokens, '1')).toEqual({
      type: 'space',
      tokenId: '4',
    });
  });

  it('returns null when the next content word arrives before a break', () => {
    const tokens = [
      token('1', '읽', 'Verb'),
      token('2', '고', 'Eomi', { isMarkable: false, posCategory: 'excluded' }),
      token('3', '다음', 'Noun'),
    ];

    expect(findSlashInsertionPoint(tokens, '1')).toBeNull();
  });
});

describe('buildSlashInsertionLookup', () => {
  it('maps anchor tokens to their rendered slash position', () => {
    const tokens = [
      token('1', '한국어', 'Noun'),
      token('2', '를', 'Josa', { isMarkable: false, posCategory: 'excluded' }),
      token('3', ' ', 'Space', {
        isMarkable: false,
        posCategory: 'excluded',
        isWordLike: false,
      }),
    ];

    expect(buildSlashInsertionLookup(tokens, ['1'])).toEqual(new Map([['3', 'space']]));
  });
});

describe('formatDuration', () => {
  it('formats elapsed time as hh:mm:ss', () => {
    expect(formatDuration(3723000)).toBe('01:02:03');
  });
});

describe('loadPersistedState', () => {
  it('restores a running timer and ignores legacy click-position state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00+09:00'));
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '한국어',
        tokens: [token('1', '한국어', 'Noun')],
        markedTokenIds: ['1'],
        slashAnchorTokenIds: ['1'],
        lastClickedTokenId: '1',
        timerState: {
          baseElapsedMs: 5000,
          elapsedMs: 5000,
          isRunning: true,
          lastStartedAt: Date.now() - 3000,
        },
      }),
    );

    const restored = loadPersistedState();

    expect(restored.state.timerState.isRunning).toBe(true);
    expect(restored.state.timerState.elapsedMs).toBe(8000);
    expect(restored.state.slashAnchorTokenIds).toEqual(['1']);
    expect(restored.needsTokenRefresh).toBe(false);
    vi.useRealTimers();
  });

  it('marks persisted raw text without tokens for background reanalysis', () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '한국어',
        tokens: [],
        markedTokenIds: ['1'],
        slashAnchorTokenIds: ['1'],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    const restored = loadPersistedState();

    expect(restored.state.rawText).toBe('한국어');
    expect(restored.state.tokens).toEqual([]);
    expect(restored.state.markedTokenIds).toEqual([]);
    expect(restored.state.slashAnchorTokenIds).toEqual([]);
    expect(restored.needsTokenRefresh).toBe(true);
    vi.useRealTimers();
  });
});
