import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeText,
  buildEmptyAnalysis,
  buildClipboardText,
  computeReadingStats,
  createResetTimerState,
  formatDuration,
  groupMarkedTokens,
  loadPersistedState,
  resetReadingState,
  toggleMarkedToken,
  type LoadedPersistedState,
  type PersistedReadingState,
  type TimerState,
} from './lib/reading';

const SAMPLE_TEXT = `저는 매일 아침에 한국어 기사를 읽습니다.
어려운 단어가 나오면 클릭하면서 끝까지 읽어 봅니다.`;

function StatsCard({
  label,
  sublabel,
  value,
  accent = 'default',
}: {
  label: string;
  sublabel: string;
  value: string;
  accent?: 'default' | 'warm' | 'cool';
}) {
  return (
    <article className={`stats-card stats-card--${accent}`}>
      <p>{label}</p>
      <span>{value}</span>
      <small>{sublabel}</small>
    </article>
  );
}

function TimerPanel({
  timerState,
  onStart,
  onStop,
  onReset,
}: {
  timerState: TimerState;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  return (
    <section className="panel timer-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Timer</p>
          <h2>Reading timer</h2>
        </div>
        <div className="timer-face" aria-live="polite">
          {formatDuration(timerState.elapsedMs)}
        </div>
      </div>
      <div className="timer-actions">
        {timerState.isRunning ? (
          <button type="button" className="secondary-button" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={onStart}>
            Start
          </button>
        )}
        <button type="button" className="ghost-button" onClick={onReset}>
          Reset
        </button>
      </div>
    </section>
  );
}

function TokenButton({
  token,
  isMarked,
  onClick,
}: {
  token: PersistedReadingState['tokens'][number];
  isMarked: boolean;
  onClick: () => void;
}) {
  if (token.pos === 'Space') {
    return <span className="token-space">{token.text}</span>;
  }

  if (token.pos === 'Punctuation') {
    return <span className="token-punctuation">{token.text}</span>;
  }

  if (!token.isWordLike) {
    return <span className="reader-token">{token.text}</span>;
  }

  if (!token.isMarkable) {
    return <span className="reader-token">{token.text}</span>;
  }

  return (
    <button
      type="button"
      className={`reader-token reader-token--interactive ${isMarked ? 'reader-token--marked' : ''}`}
      onClick={onClick}
    >
      {token.text}
    </button>
  );
}

export default function App() {
  const initialLoad = useRef<LoadedPersistedState | null>(null);

  if (!initialLoad.current) {
    initialLoad.current = loadPersistedState();
  }

  const [state, setState] = useState<PersistedReadingState>(() => initialLoad.current.state);
  const [draftText, setDraftText] = useState(initialLoad.current.state.rawText);
  const [isAnalyzing, setIsAnalyzing] = useState(initialLoad.current.needsTokenRefresh);
  const [now, setNow] = useState(Date.now());
  const analysisRequestIdRef = useRef(0);

  const queueTextAnalysis = (nextText: string) => {
    const requestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = requestId;

    if (!nextText.trim()) {
      setIsAnalyzing(false);
      return;
    }

    setIsAnalyzing(true);

    void analyzeText(nextText)
      .then((analysis) => {
        if (analysisRequestIdRef.current !== requestId) {
          return;
        }

        setState((current) => {
          if (current.rawText !== nextText) {
            return current;
          }

          return {
            ...current,
            tokens: analysis.tokens,
          };
        });
        setIsAnalyzing(false);
      })
      .catch(() => {
        if (analysisRequestIdRef.current !== requestId) {
          return;
        }

        setIsAnalyzing(false);
      });
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!initialLoad.current.needsTokenRefresh || !initialLoad.current.state.rawText.trim()) {
      return;
    }

    queueTextAnalysis(initialLoad.current.state.rawText);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('korean-extensive-reading-tool:v1', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const elapsedWhileRunning =
      state.timerState.isRunning && state.timerState.lastStartedAt
        ? now - state.timerState.lastStartedAt
        : 0;

    if (!elapsedWhileRunning) {
      return;
    }

    setState((current) => {
      if (!current.timerState.isRunning || !current.timerState.lastStartedAt) {
        return current;
      }

      return {
        ...current,
        timerState: {
          ...current.timerState,
          elapsedMs: current.timerState.baseElapsedMs + (now - current.timerState.lastStartedAt),
        },
      };
    });
  }, [now, state.timerState.isRunning, state.timerState.lastStartedAt]);

  const groupedWords = useMemo(
    () => groupMarkedTokens(state.tokens, new Set(state.markedTokenIds)),
    [state.tokens, state.markedTokenIds],
  );

  const timerDisplayState = useMemo<TimerState>(() => {
    if (!state.timerState.isRunning || !state.timerState.lastStartedAt) {
      return {
        ...state.timerState,
        elapsedMs: state.timerState.baseElapsedMs,
      };
    }

    return {
      ...state.timerState,
      elapsedMs: state.timerState.baseElapsedMs + (now - state.timerState.lastStartedAt),
    };
  }, [now, state.timerState]);

  const stats = useMemo(
    () =>
      computeReadingStats(
        state.tokens,
        new Set(state.markedTokenIds),
        state.rawText,
        timerDisplayState.elapsedMs,
        state.timerState.isRunning,
      ),
    [state.markedTokenIds, state.rawText, state.tokens, state.timerState.isRunning, timerDisplayState.elapsedMs],
  );

  const applyNewText = (nextText: string) => {
    setDraftText(nextText);
    setState((current) => ({
      ...current,
      rawText: nextText,
      tokens: buildEmptyAnalysis().tokens,
      markedTokenIds: [],
      lastClickedTokenId: null,
      timerState: createResetTimerState(),
    }));
    queueTextAnalysis(nextText);
  };

  const handleToggleToken = (tokenId: string) => {
    setState((current) => {
      const toggled = toggleMarkedToken(current.markedTokenIds, tokenId);
      return {
        ...current,
        markedTokenIds: toggled,
        lastClickedTokenId: tokenId,
      };
    });
  };

  const handleStartTimer = () => {
    setState((current) => {
      if (current.timerState.isRunning) {
        return current;
      }

      return {
        ...current,
        timerState: {
          ...current.timerState,
          isRunning: true,
          lastStartedAt: Date.now(),
        },
      };
    });
  };

  const handleStopTimer = () => {
    setState((current) => {
      if (!current.timerState.isRunning || !current.timerState.lastStartedAt) {
        return current;
      }

      const stoppedAt = Date.now();
      return {
        ...current,
        timerState: {
          isRunning: false,
          lastStartedAt: null,
          baseElapsedMs:
            current.timerState.baseElapsedMs + (stoppedAt - current.timerState.lastStartedAt),
          elapsedMs:
            current.timerState.baseElapsedMs + (stoppedAt - current.timerState.lastStartedAt),
        },
      };
    });
  };

  const handleResetTimer = () => {
    setState((current) => ({
      ...current,
      timerState: createResetTimerState(),
    }));
  };

  const handleClearAll = () => {
    setDraftText('');
    setState((current) => ({
      ...resetReadingState(),
      timerState: current.timerState,
    }));
  };

  const handleLoadSample = () => {
    applyNewText(SAMPLE_TEXT);
  };

  const handleCopyUnknownWords = async () => {
    if (!groupedWords.length) {
      return;
    }

    await navigator.clipboard.writeText(buildClipboardText(groupedWords));
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Korean Extensive Reading Tool</p>
          <h1>Track unknown words while you read</h1>
          <p className="hero-copy">
            Paste one Korean passage, start the timer, and mark only the words you
            do not know. Function words stay outside the denominator so the ratio
            stays useful for extensive reading.
          </p>
        </div>
      </section>

      <section className="layout-grid">
        <div className="main-column">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Input</p>
                <h2>Paste your passage</h2>
              </div>
              <div className="panel-actions">
                <button type="button" className="secondary-button" onClick={handleLoadSample}>
                  Sample
                </button>
                <button type="button" className="ghost-button" onClick={handleClearAll}>
                  Clear
                </button>
              </div>
            </div>
            <label className="input-label" htmlFor="passage-input">
              Korean text
            </label>
            <textarea
              id="passage-input"
              className="passage-input"
              value={draftText}
              onChange={(event) => applyNewText(event.target.value)}
              placeholder="Paste one Korean passage here."
              rows={8}
            />
            <p className="input-help">
              Token analysis updates automatically.
              {isAnalyzing ? ' Updating…' : ''}
            </p>
          </section>

          <TimerPanel
            timerState={timerDisplayState}
            onStart={handleStartTimer}
            onStop={handleStopTimer}
            onReset={handleResetTimer}
          />

          <section className="panel reader-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Reader</p>
                <h2>Click unknown words</h2>
              </div>
              <div className="legend">
                <span className="legend-chip legend-chip--markable">Clickable</span>
                <span className="legend-chip legend-chip--marked">Marked</span>
              </div>
            </div>
            <p className="reader-help">
              Read naturally and click only the words you do not know.
            </p>
            <div className="reader-surface" aria-live="polite">
              {state.tokens.length ? (
                state.tokens.map((token) => (
                  <TokenButton
                    key={token.id}
                    token={token}
                    isMarked={state.markedTokenIds.includes(token.id)}
                    onClick={() => handleToggleToken(token.id)}
                  />
                ))
              ) : isAnalyzing ? (
                <div className="empty-state">
                  Analyzing text...
                </div>
              ) : (
                <div className="empty-state">
                  Paste Korean text to start reading.
                </div>
              )}
            </div>
          </section>

          <div className="reader-footer-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleStopTimer}
              disabled={!state.timerState.isRunning}
            >
              Stop After Reading
            </button>
          </div>

          <section className="panel results-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Results</p>
                <h2>Reading summary</h2>
              </div>
            </div>
            {state.timerState.isRunning ? (
              <div className="empty-state">
                Results appear after you stop the timer.
              </div>
            ) : (
              <>
                <section className="stats-grid" aria-label="reading stats">
                  <StatsCard
                    label="Unknown words"
                    sublabel="Clickable content words only"
                    value={String(stats.unknownWordCount)}
                    accent="warm"
                  />
                  <StatsCard
                    label="Total words"
                    sublabel="Split by spaces"
                    value={String(stats.totalWords)}
                  />
                  <StatsCard
                    label="Total characters"
                    sublabel="Spaces excluded"
                    value={String(stats.totalCharacters)}
                  />
                  <StatsCard
                    label="Unknown ratio"
                    sublabel="Excluded tokens removed"
                    value={stats.overallUnknownRatioLabel}
                    accent="cool"
                  />
                  <StatsCard
                    label="Full-text CPM"
                    sublabel="Characters per minute"
                    value={stats.fullTextCharactersPerMinuteLabel}
                    accent="cool"
                  />
                  <StatsCard
                    label="Full-text WPM"
                    sublabel="Words per minute"
                    value={stats.fullTextWordsPerMinuteLabel}
                    accent="cool"
                  />
                </section>

                <section className="unknown-list-section">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Unknown List</p>
                      <h2>Grouped unique words</h2>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        void handleCopyUnknownWords();
                      }}
                      disabled={!groupedWords.length}
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <div className="group-list">
                    {groupedWords.length ? (
                      groupedWords.map((group) => (
                        <article className="group-card" key={group.normalizedSurface}>
                          <strong>{group.displayText}</strong>
                          <span>{group.count} occurrence(s)</span>
                          <small>{group.posLabel} · from {group.sourceText}</small>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">
                        No unknown words yet.
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
