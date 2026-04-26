import { loadOktTokenizer } from './oktTokenizer';

export type PosCategory = 'content' | 'excluded';
export type KoreanPos = string;

export type ReadingToken = {
  id: string;
  index: number;
  text: string;
  normalizedSurface: string;
  dictionaryForm: string;
  pos: KoreanPos;
  posCategory: PosCategory;
  isMarkable: boolean;
  isWordLike: boolean;
  offset: number;
  length: number;
};

export type TimerState = {
  baseElapsedMs: number;
  elapsedMs: number;
  isRunning: boolean;
  lastStartedAt: number | null;
};

export type PersistedReadingState = {
  rawText: string;
  tokens: ReadingToken[];
  markedTokenIds: string[];
  slashAnchorTokenIds: string[];
  timerState: TimerState;
};

export type LoadedPersistedState = {
  state: PersistedReadingState;
  needsTokenRefresh: boolean;
};

export type ReadingStats = {
  unknownWordCount: number;
  totalWords: number;
  totalCharacters: number;
  overallUnknownRatio: number | null;
  fullTextCharactersPerMinute: number | null;
  fullTextWordsPerMinute: number | null;
  overallUnknownRatioLabel: string;
  fullTextCharactersPerMinuteLabel: string;
  fullTextWordsPerMinuteLabel: string;
};

export type MarkedWordGroup = {
  normalizedSurface: string;
  displayText: string;
  sourceText: string;
  count: number;
  posLabel: string;
};

export type SlashInsertionPoint =
  | { type: 'space'; tokenId: string }
  | { type: 'punctuation'; tokenId: string };

const STORAGE_KEY = 'korean-extensive-reading-tool:v1';

const EXCLUDED_POS = new Set<KoreanPos>([
  'Josa',
  'Eomi',
  'PreEomi',
  'Conjunction',
  'Modifier',
  'VerbPrefix',
  'Suffix',
  'Space',
  'Punctuation',
  'Others',
  'KoreanParticle',
  'ScreenName',
  'Email',
  'URL',
  'CashTag',
]);

const NON_WORD_POS = new Set<KoreanPos>([
  'Space',
  'Punctuation',
  'Others',
]);

type AnalyzedToken = {
  text: string;
  pos: KoreanPos;
  offset: number;
  length: number;
  stem?: string;
};

export function buildEmptyAnalysis(): { tokens: ReadingToken[] } {
  return { tokens: [] };
}

export function createEmptyPersistedState(): PersistedReadingState {
  return {
    rawText: '',
    tokens: [],
    markedTokenIds: [],
    slashAnchorTokenIds: [],
    timerState: createResetTimerState(),
  };
}

export function resetReadingState(): PersistedReadingState {
  return createEmptyPersistedState();
}

export function createResetTimerState(): TimerState {
  return {
    baseElapsedMs: 0,
    elapsedMs: 0,
    isRunning: false,
    lastStartedAt: null,
  };
}

export async function analyzeText(rawText: string): Promise<{ tokens: ReadingToken[] }> {
  const { tokenize } = await loadOktTokenizer();
  return buildAnalysisFromTokens(tokenize(rawText));
}

export function computeReadingStats(
  tokens: ReadingToken[],
  markedIds: Set<string>,
  rawText: string,
  elapsedMs: number,
  isRunning: boolean,
): ReadingStats {
  const totalWords = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
  const totalCharacters = rawText.replace(/\s/g, '').length;
  const unknownWordCount = tokens.filter(
    (token) => token.isMarkable && markedIds.has(token.id),
  ).length;
  const overallDenominator = tokens.filter((token) => token.isMarkable).length;
  const overallUnknownRatio = safeRatio(unknownWordCount, overallDenominator);
  const fullTextCharactersPerMinute =
    !isRunning && elapsedMs > 0 ? totalCharacters / (elapsedMs / 60000) : null;
  const fullTextWordsPerMinute =
    !isRunning && elapsedMs > 0 ? totalWords / (elapsedMs / 60000) : null;

  return {
    unknownWordCount,
    totalWords,
    totalCharacters,
    overallUnknownRatio,
    fullTextCharactersPerMinute,
    fullTextWordsPerMinute,
    overallUnknownRatioLabel: formatRatio(overallUnknownRatio),
    fullTextCharactersPerMinuteLabel: formatSpeed(fullTextCharactersPerMinute),
    fullTextWordsPerMinuteLabel: formatSpeed(fullTextWordsPerMinute),
  };
}

export function groupMarkedTokens(
  tokens: ReadingToken[],
  markedIds: Set<string>,
): MarkedWordGroup[] {
  const grouped = new Map<string, MarkedWordGroup>();

  for (const token of tokens) {
    if (!token.isMarkable || !markedIds.has(token.id)) {
      continue;
    }

    const existing = grouped.get(token.normalizedSurface);
    if (existing) {
      existing.count += 1;
      continue;
    }

    grouped.set(token.normalizedSurface, {
      normalizedSurface: token.normalizedSurface,
      displayText: token.dictionaryForm,
      sourceText: token.text,
      count: 1,
      posLabel: token.pos,
    });
  }

  return [...grouped.values()].sort((left, right) => right.count - left.count);
}

export function buildClipboardText(groups: MarkedWordGroup[]): string {
  if (!groups.length) {
    return '';
  }

  return `${groups.map((group) => group.displayText).join('\n')}\n`;
}

export function toggleMarkedToken(markedTokenIds: string[], tokenId: string): string[] {
  return markedTokenIds.includes(tokenId)
    ? markedTokenIds.filter((id) => id !== tokenId)
    : [...markedTokenIds, tokenId];
}

export function toggleSlashAnchorToken(slashAnchorTokenIds: string[], tokenId: string): string[] {
  return slashAnchorTokenIds.includes(tokenId)
    ? slashAnchorTokenIds.filter((id) => id !== tokenId)
    : [...slashAnchorTokenIds, tokenId];
}

export function cycleContentTokenInteraction(
  markedTokenIds: string[],
  slashAnchorTokenIds: string[],
  tokenId: string,
): {
  markedTokenIds: string[];
  slashAnchorTokenIds: string[];
} {
  const isMarked = markedTokenIds.includes(tokenId);
  const hasSlash = slashAnchorTokenIds.includes(tokenId);

  if (!isMarked && !hasSlash) {
    return {
      markedTokenIds: [...markedTokenIds, tokenId],
      slashAnchorTokenIds,
    };
  }

  if (isMarked && !hasSlash) {
    return {
      markedTokenIds,
      slashAnchorTokenIds: [...slashAnchorTokenIds, tokenId],
    };
  }

  if (isMarked && hasSlash) {
    return {
      markedTokenIds: markedTokenIds.filter((id) => id !== tokenId),
      slashAnchorTokenIds,
    };
  }

  return {
    markedTokenIds,
    slashAnchorTokenIds: slashAnchorTokenIds.filter((id) => id !== tokenId),
  };
}

export function canAnchorSlash(token: ReadingToken | undefined): boolean {
  if (!token) {
    return false;
  }

  return token.isWordLike;
}

export function findSlashInsertionPoint(
  tokens: ReadingToken[],
  anchorTokenId: string,
): SlashInsertionPoint | null {
  const anchorIndex = tokens.findIndex((token) => token.id === anchorTokenId);

  if (anchorIndex === -1 || !canAnchorSlash(tokens[anchorIndex])) {
    return null;
  }

  let pendingPunctuationTokenId: string | null = null;

  for (let index = anchorIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.pos === 'Space') {
      return {
        type: 'space',
        tokenId: token.id,
      };
    }

    if (token.pos === 'Punctuation') {
      pendingPunctuationTokenId = token.id;
      continue;
    }

    pendingPunctuationTokenId = null;
  }

  return pendingPunctuationTokenId
    ? {
        type: 'punctuation',
        tokenId: pendingPunctuationTokenId,
      }
    : null;
}

export function buildSlashInsertionLookup(
  tokens: ReadingToken[],
  slashAnchorTokenIds: string[],
): Map<string, SlashInsertionPoint['type']> {
  const lookup = new Map<string, SlashInsertionPoint['type']>();

  for (const anchorTokenId of slashAnchorTokenIds) {
    const insertionPoint = findSlashInsertionPoint(tokens, anchorTokenId);

    if (!insertionPoint) {
      continue;
    }

    lookup.set(insertionPoint.tokenId, insertionPoint.type);
  }

  return lookup;
}

export function loadPersistedState(): LoadedPersistedState {
  const empty = {
    state: createEmptyPersistedState(),
    needsTokenRefresh: false,
  };

  if (typeof window === 'undefined') {
    return empty;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return empty;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedReadingState>;
    const base = createEmptyPersistedState();
    const rawText = typeof parsed.rawText === 'string' ? parsed.rawText : '';
    const persistedTokens = Array.isArray(parsed.tokens) && parsed.tokens.length
      ? sanitizeTokens(parsed.tokens)
      : [];
    const markedTokenIds = Array.isArray(parsed.markedTokenIds)
      ? parsed.markedTokenIds.filter((value): value is string => typeof value === 'string')
      : [];
    const slashAnchorTokenIds = Array.isArray(parsed.slashAnchorTokenIds)
      ? parsed.slashAnchorTokenIds.filter((value): value is string => typeof value === 'string')
      : [];
    const timerState = restoreTimerState(parsed.timerState);
    const needsTokenRefresh = Boolean(rawText && !persistedTokens.length);

    return {
      state: {
        ...base,
        rawText,
        tokens: persistedTokens,
        markedTokenIds: markedTokenIds.filter((id) => persistedTokens.some((token) => token.id === id)),
        slashAnchorTokenIds: slashAnchorTokenIds.filter((id) =>
          persistedTokens.some((token) => token.id === id),
        ),
        timerState,
      },
      needsTokenRefresh,
    };
  } catch {
    return empty;
  }
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function buildAnalysisFromTokens(analyzed: AnalyzedToken[]): { tokens: ReadingToken[] } {
  const tokens = analyzed.map((token, index) => {
    const posCategory: PosCategory = EXCLUDED_POS.has(token.pos) ? 'excluded' : 'content';
    const isWordLike = !NON_WORD_POS.has(token.pos);

    return {
      id: createTokenId(index, token.offset, token.text),
      index,
      text: token.text,
      normalizedSurface: normalizeSurface(token),
      dictionaryForm: buildDictionaryForm(token),
      pos: token.pos,
      posCategory,
      isMarkable: isWordLike && posCategory === 'content',
      isWordLike,
      offset: token.offset,
      length: token.length,
    };
  });

  return { tokens };
}

function sanitizeTokens(tokens: unknown[]): ReadingToken[] {
  return tokens.flatMap((token, index) => {
    if (!token || typeof token !== 'object') {
      return [];
    }

    const candidate = token as Partial<ReadingToken>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.text !== 'string' ||
      typeof candidate.normalizedSurface !== 'string' ||
      typeof candidate.pos !== 'string' ||
      typeof candidate.offset !== 'number' ||
      typeof candidate.length !== 'number'
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        index,
        text: candidate.text,
        normalizedSurface: candidate.normalizedSurface,
        dictionaryForm:
          typeof candidate.dictionaryForm === 'string'
            ? candidate.dictionaryForm
            : candidate.normalizedSurface,
        pos: candidate.pos as KoreanPos,
        posCategory: candidate.posCategory === 'excluded' ? 'excluded' : 'content',
        isMarkable: Boolean(candidate.isMarkable),
        isWordLike: Boolean(candidate.isWordLike),
        offset: candidate.offset,
        length: candidate.length,
      },
    ];
  });
}

function restoreTimerState(timerState: unknown): TimerState {
  if (!timerState || typeof timerState !== 'object') {
    return createEmptyPersistedState().timerState;
  }

  const candidate = timerState as Partial<TimerState>;
  const baseElapsedMs =
    typeof candidate.baseElapsedMs === 'number'
      ? candidate.baseElapsedMs
      : typeof candidate.elapsedMs === 'number'
        ? candidate.elapsedMs
        : 0;
  const isRunning = Boolean(candidate.isRunning);
  const lastStartedAt = typeof candidate.lastStartedAt === 'number' ? candidate.lastStartedAt : null;

  if (!isRunning || !lastStartedAt) {
    return {
      baseElapsedMs,
      elapsedMs: baseElapsedMs,
      isRunning: false,
      lastStartedAt: null,
    };
  }

  const resumedElapsedMs = baseElapsedMs + Math.max(0, Date.now() - lastStartedAt);
  return {
    baseElapsedMs,
    elapsedMs: resumedElapsedMs,
    isRunning: true,
    lastStartedAt,
  };
}

function createTokenId(index: number, offset: number, text: string): string {
  return `${index}-${offset}-${text}`;
}

function normalizeSurface(token: { text: string; pos: KoreanPos; stem?: string }): string {
  if (
    (token.pos === 'Verb' ||
      token.pos === 'Adjective' ||
      token.pos === 'Adverb') &&
    typeof token.stem === 'string' &&
    token.stem.length
  ) {
    return token.stem;
  }

  return token.text.toLowerCase();
}

function buildDictionaryForm(token: { text: string; pos: KoreanPos; stem?: string }): string {
  if ((token.pos === 'Verb' || token.pos === 'Adjective') && typeof token.stem === 'string') {
    return token.stem.endsWith('다') ? token.stem : `${token.stem}다`;
  }

  if (token.pos === 'Adverb' && typeof token.stem === 'string') {
    return token.stem;
  }

  return normalizeSurface(token);
}

function safeRatio(count: number, total: number): number | null {
  if (!total) {
    return null;
  }

  return count / total;
}

function formatRatio(ratio: number | null): string {
  if (ratio === null) {
    return '-';
  }

  return `${(ratio * 100).toFixed(1)}%`;
}

function formatSpeed(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return value.toFixed(1);
}
