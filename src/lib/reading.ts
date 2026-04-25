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

export type ReadingPhraseSpan = {
  startOffset: number;
  endOffset: number;
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
  showReadingChunks: boolean;
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

type AnalyzedPhrase = {
  offset: number;
  length: number;
  text: string;
  tokens: Array<Pick<AnalyzedToken, 'text' | 'pos' | 'offset' | 'length'>>;
};

type ReadingEojeol = {
  firstTokenIndex: number;
  lastTokenIndex: number;
  primaryPos: KoreanPos | null;
  primaryText: string;
  primarySurface: string;
  endsWithJosa: boolean;
  endsWithConnective: boolean;
  lockWithNext: boolean;
  sentenceBreakAfter: boolean;
};

export function buildEmptyAnalysis(): { tokens: ReadingToken[] } {
  return { tokens: [] };
}

export function createEmptyPersistedState(): PersistedReadingState {
  return {
    rawText: '',
    tokens: [],
    markedTokenIds: [],
    showReadingChunks: false,
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

export async function analyzeText(rawText: string): Promise<{
  tokens: ReadingToken[];
  phraseSpans: ReadingPhraseSpan[];
}> {
  const { extractPhrases, tokenize } = await loadOktTokenizer();
  const analyzedTokens = tokenize(rawText);

  return {
    ...buildAnalysisFromTokens(analyzedTokens),
    phraseSpans: buildPhraseSpans(extractPhrases(analyzedTokens)),
  };
}

export function buildReadingChunkBreaks(
  tokens: ReadingToken[],
  phraseSpans: ReadingPhraseSpan[] = [],
): Set<string> {
  const breakIds = new Set<string>();
  const eojeols = buildEojeols(tokens, phraseSpans);
  let chunkStartIndex = 0;

  for (let index = 0; index < eojeols.length; index += 1) {
    const current = eojeols[index];
    const next = eojeols[index + 1];
    const chunkLength = index - chunkStartIndex + 1;
    const currentChunkHasPredicate = eojeols
      .slice(chunkStartIndex, index + 1)
      .some((eojeol) => isPredicatePos(eojeol.primaryPos));

    if (!next) {
      continue;
    }

    if (current.lockWithNext) {
      continue;
    }

    if (current.endsWithConnective && !shouldKeepPredicateChain(current, next)) {
      breakIds.add(tokens[current.lastTokenIndex].id);
      chunkStartIndex = index + 1;
      continue;
    }

    const weakBoundary = current.endsWithJosa || current.primaryPos === 'Adverb' || current.primaryPos === 'Determiner';
    const nextIsPredicate = isPredicatePos(next.primaryPos) || next.endsWithConnective;

    if (weakBoundary) {
      if (nextIsPredicate && !currentChunkHasPredicate && chunkLength < 3) {
        continue;
      }

      if (chunkLength >= 2) {
        breakIds.add(tokens[current.lastTokenIndex].id);
        chunkStartIndex = index + 1;
        continue;
      }
    }

    if (current.sentenceBreakAfter) {
      breakIds.add(tokens[current.lastTokenIndex].id);
      chunkStartIndex = index + 1;
      continue;
    }

    if (chunkLength >= 3 && !nextIsPredicate) {
      breakIds.add(tokens[current.lastTokenIndex].id);
      chunkStartIndex = index + 1;
    }
  }

  return breakIds;
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
    const timerState = restoreTimerState(parsed.timerState);
    const needsTokenRefresh = Boolean(rawText && !persistedTokens.length);

    return {
      state: {
        ...base,
        rawText,
        tokens: persistedTokens,
        markedTokenIds: markedTokenIds.filter((id) => persistedTokens.some((token) => token.id === id)),
        showReadingChunks: Boolean(parsed.showReadingChunks),
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

function buildPhraseSpans(phrases: AnalyzedPhrase[]): ReadingPhraseSpan[] {
  return phrases.flatMap((phrase) => {
    const wordLikeTokens = phrase.tokens.filter((token) => !NON_WORD_POS.has(token.pos));
    if (wordLikeTokens.length < 2 || !phrase.text.trim()) {
      return [];
    }

    if (wordLikeTokens.some((token) => token.pos === 'Punctuation')) {
      return [];
    }

    return [{
      startOffset: phrase.offset,
      endOffset: phrase.offset + phrase.length,
    }];
  });
}

function buildEojeols(tokens: ReadingToken[], phraseSpans: ReadingPhraseSpan[]): ReadingEojeol[] {
  const rawEojeols: ReadingEojeol[] = [];
  let firstTokenIndex: number | null = null;
  let lastTokenIndex = -1;

  const flush = (nextIndex: number) => {
    if (firstTokenIndex === null || lastTokenIndex < firstTokenIndex) {
      firstTokenIndex = null;
      lastTokenIndex = -1;
      return;
    }

    const slice = tokens.slice(firstTokenIndex, lastTokenIndex + 1);
    const contentTokens = slice.filter((token) => token.pos !== 'Space' && token.pos !== 'Punctuation');
    const lastToken = contentTokens.at(-1);
    const primaryToken = [...contentTokens].reverse().find((token) => token.isWordLike) ?? lastToken ?? null;
    const betweenText = tokens
      .slice(lastTokenIndex + 1, nextIndex)
      .filter((token) => token.pos === 'Punctuation')
      .map((token) => token.text)
      .join('');

    rawEojeols.push({
      firstTokenIndex,
      lastTokenIndex,
      primaryPos: primaryToken?.pos ?? null,
      primaryText: primaryToken?.text ?? '',
      primarySurface: primaryToken?.dictionaryForm ?? primaryToken?.normalizedSurface ?? '',
      endsWithJosa: lastToken?.pos === 'Josa',
      endsWithConnective: isConnectiveEnding(primaryToken?.text ?? ''),
      lockWithNext: false,
      sentenceBreakAfter: /[.!?。！？]/.test(betweenText),
    });

    firstTokenIndex = null;
    lastTokenIndex = -1;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.pos === 'Space' || token.pos === 'Punctuation') {
      flush(index);
      continue;
    }

    if (firstTokenIndex === null) {
      firstTokenIndex = index;
    }

    lastTokenIndex = index;
  }

  flush(tokens.length);

  const tokenIndexToEojeolIndex = new Map<number, number>();
  rawEojeols.forEach((eojeol, eojeolIndex) => {
    for (let index = eojeol.firstTokenIndex; index <= eojeol.lastTokenIndex; index += 1) {
      tokenIndexToEojeolIndex.set(index, eojeolIndex);
    }
  });

  for (const span of phraseSpans) {
    const coveredIndices = tokens
      .map((token, tokenIndex) => ({ token, tokenIndex }))
      .filter(({ token }) => token.offset >= span.startOffset && token.offset + token.length <= span.endOffset)
      .map(({ tokenIndex }) => tokenIndexToEojeolIndex.get(tokenIndex))
      .filter((value): value is number => value !== undefined);

    const uniqueCovered = [...new Set(coveredIndices)].sort((left, right) => left - right);
    for (let index = 0; index < uniqueCovered.length - 1; index += 1) {
      const eojeolIndex = uniqueCovered[index];
      rawEojeols[eojeolIndex].lockWithNext = true;
    }
  }

  return rawEojeols;
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

function isPredicatePos(pos: KoreanPos | null): boolean {
  return pos === 'Verb' || pos === 'Adjective';
}

function isConnectiveEnding(text: string): boolean {
  return /(고|서|며|면|지만|는데|니까|도록|려고|러|면서|더니|자)$/.test(text);
}

function shouldKeepPredicateChain(current: ReadingEojeol, next: ReadingEojeol): boolean {
  return current.primaryPos === 'Verb' &&
    /고$/.test(current.primaryText) &&
    AUXILIARY_SURFACES.has(next.primarySurface);
}

const AUXILIARY_SURFACES = new Set([
  '싶다',
  '있다',
  '없다',
  '않다',
  '보다',
  '주다',
  '되다',
  '가다',
  '오다',
]);

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
