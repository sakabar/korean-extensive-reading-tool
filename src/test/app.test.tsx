import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json';
import App from '../App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it('updates stats and unknown list when a content token is clicked', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });
    expect(screen.getByText('Analyzing text...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const token = await screen.findByRole('button', { name: '한국어' });
    fireEvent.click(token);

    expect(screen.getByText('Results appear after you stop the timer.')).toBeInTheDocument();
  });

  it('shows the current app version from package.json', () => {
    render(<App />);

    expect(screen.getByText(`Version ${packageJson.version}`)).toBeInTheDocument();
  });

  it('shows timer before reader and stop action directly after reader', () => {
    render(<App />);

    const timerHeading = screen.getByText('Reading timer');
    const readerHeading = screen.getByText('Click unknown words');
    const stopButton = screen.getByRole('button', { name: 'Stop After Reading' });

    expect(timerHeading.compareDocumentPosition(readerHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(readerHeading.compareDocumentPosition(stopButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not visually distinguish excluded tokens in the reader', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });

    const excludedToken = await screen.findByRole('button', { name: '는' });
    expect(excludedToken).toHaveClass('reader-token--interactive');
    expect(excludedToken).not.toHaveClass('reader-token--marked');
    expect(screen.queryByText('Excluded')).not.toBeInTheDocument();
  });

  it('shows results and unknown list after stopping the timer', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: '한국어' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop After Reading' }));

    expect(screen.getByText('Reading summary')).toBeInTheDocument();
    expect(screen.getByText('Grouped unique words')).toBeInTheDocument();
  });

  it('restores persisted text, marks, and timer state on reload', () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '한국어',
        tokens: [
          {
            id: '0-0-한국어',
            index: 0,
            text: '한국어',
            normalizedSurface: '한국어',
            dictionaryForm: '한국어',
            pos: 'Noun',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 0,
            length: 3,
          },
        ],
        markedTokenIds: ['0-0-한국어'],
        slashAnchorTokenIds: [],
        timerState: {
          baseElapsedMs: 65000,
          elapsedMs: 65000,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    expect(screen.getByDisplayValue('한국어')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한국어' })).toHaveClass('reader-token--marked');
    expect(screen.getByText('00:01:05')).toBeInTheDocument();
    expect(screen.getByText('Reading summary')).toBeInTheDocument();
  });

  it('re-analyzes persisted raw text when stored tokens are missing', async () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '저는 한국어를 공부합니다.',
        tokens: [],
        markedTokenIds: [],
        slashAnchorTokenIds: [],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    expect(screen.getByText('Analyzing text...')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '한국어' })).toBeInTheDocument();
  });

  it('keeps only the latest analysis result during fast consecutive input', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });
    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 책을 읽습니다.' },
    });

    expect(await screen.findByRole('button', { name: '책' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '한국어' })).not.toBeInTheDocument();
  });

  it('uses the same timer reset result for text updates and reset button', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 읽습니다.' },
    });

    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('저는 한국어를 읽습니다.')).toBeInTheDocument();
  });

  it('copies grouped unknown words in displayed order', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '한국어를 읽고 한국어를 배웁니다.' },
    });
    fireEvent.click((await screen.findAllByRole('button', { name: '한국어' }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: '읽고' }));

    fireEvent.click(screen.getByRole('button', { name: 'Copy to Clipboard' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('한국어\n읽다\n');
  });

  it('disables copy button when unknown list is empty', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Copy to Clipboard' })).toBeDisabled();
  });

  it('disables clear selections when no unknown words are marked', () => {
    render(<App />);

    expect(screen.queryByText('Clickable')).not.toBeInTheDocument();
    expect(screen.queryByText('Marked')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear Selections' })).toBeDisabled();
  });

  it('keeps marked words when clear selections is canceled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '한국어' }));

    fireEvent.click(screen.getByRole('button', { name: 'Clear Selections' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Clear all marked unknown words? This cannot be undone.',
    );
    expect(screen.getByRole('button', { name: '한국어' })).toHaveClass('reader-token--marked');
    expect(screen.getByRole('button', { name: 'Clear Selections' })).toBeEnabled();
  });

  it('clears marked words after confirmation without resetting the timer', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: '한국어' }));

    fireEvent.click(screen.getByRole('button', { name: 'Clear Selections' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Clear all marked unknown words? This cannot be undone.',
    );
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한국어' })).not.toHaveClass('reader-token--marked');
    expect(screen.getByRole('button', { name: 'Clear Selections' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop After Reading' }));

    expect(screen.getByText('No unknown words yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy to Clipboard' })).toBeDisabled();
  });

  it('toggles a slash on function-word click and removes it on repeated click', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });

    const token = await screen.findByRole('button', { name: '는' });
    fireEvent.click(token);

    expect(screen.getByLabelText('Slash break')).toBeInTheDocument();

    fireEvent.click(token);

    expect(screen.queryByLabelText('Slash break')).not.toBeInTheDocument();
  });

  it('cycles a slash-eligible content word through unknown, unknown+slash, slash, and none', () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '읽고 다음',
        tokens: [
          {
            id: '0-0-읽고',
            index: 0,
            text: '읽고',
            normalizedSurface: '읽다',
            dictionaryForm: '읽다',
            pos: 'Verb',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 0,
            length: 2,
          },
          {
            id: '1-2- ',
            index: 1,
            text: ' ',
            normalizedSurface: ' ',
            dictionaryForm: ' ',
            pos: 'Space',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: false,
            offset: 2,
            length: 1,
          },
          {
            id: '2-3-다음',
            index: 2,
            text: '다음',
            normalizedSurface: '다음',
            dictionaryForm: '다음',
            pos: 'Noun',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 3,
            length: 2,
          },
        ],
        markedTokenIds: [],
        slashAnchorTokenIds: [],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    const token = screen.getByRole('button', { name: '읽고' });

    fireEvent.click(token);
    expect(token).toHaveClass('reader-token--marked');
    expect(screen.queryByLabelText('Slash break')).not.toBeInTheDocument();

    fireEvent.click(token);
    expect(token).toHaveClass('reader-token--marked');
    expect(screen.getByLabelText('Slash break')).toBeInTheDocument();

    fireEvent.click(token);
    expect(token).not.toHaveClass('reader-token--marked');
    expect(screen.getByLabelText('Slash break')).toBeInTheDocument();

    fireEvent.click(token);
    expect(token).not.toHaveClass('reader-token--marked');
    expect(screen.queryByLabelText('Slash break')).not.toBeInTheDocument();
  });

  it('keeps slash positions when clearing unknown word selections', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '저는 한국어를 공부합니다.' },
    });

    fireEvent.click(await screen.findByRole('button', { name: '는' }));
    fireEvent.click(screen.getByRole('button', { name: '한국어' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Selections' }));

    expect(screen.getByLabelText('Slash break')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한국어' })).not.toHaveClass('reader-token--marked');
  });

  it('adds a slash after a sentence-final period only when no space follows', async () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '많다.',
        tokens: [
          {
            id: '0-0-많',
            index: 0,
            text: '많',
            normalizedSurface: '많다',
            dictionaryForm: '많다',
            pos: 'Adjective',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 0,
            length: 1,
          },
          {
            id: '1-1-다',
            index: 1,
            text: '다',
            normalizedSurface: '다',
            dictionaryForm: '다',
            pos: 'Eomi',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: true,
            offset: 1,
            length: 1,
          },
          {
            id: '2-2-.',
            index: 2,
            text: '.',
            normalizedSurface: '.',
            dictionaryForm: '.',
            pos: 'Punctuation',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: false,
            offset: 2,
            length: 1,
          },
        ],
        markedTokenIds: [],
        slashAnchorTokenIds: [],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '다' }));

    const surface = screen.getByText('.');
    const slash = screen.getByLabelText('Slash break');

    expect(surface.compareDocumentPosition(slash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('places the slash at the next space instead of right after punctuation when a space exists', async () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '많다. 다음',
        tokens: [
          {
            id: '0-0-많',
            index: 0,
            text: '많',
            normalizedSurface: '많다',
            dictionaryForm: '많다',
            pos: 'Adjective',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 0,
            length: 1,
          },
          {
            id: '1-1-다',
            index: 1,
            text: '다',
            normalizedSurface: '다',
            dictionaryForm: '다',
            pos: 'Eomi',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: true,
            offset: 1,
            length: 1,
          },
          {
            id: '2-2-.',
            index: 2,
            text: '.',
            normalizedSurface: '.',
            dictionaryForm: '.',
            pos: 'Punctuation',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: false,
            offset: 2,
            length: 1,
          },
          {
            id: '3-3- ',
            index: 3,
            text: ' ',
            normalizedSurface: ' ',
            dictionaryForm: ' ',
            pos: 'Space',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: false,
            offset: 3,
            length: 1,
          },
          {
            id: '4-4-다음',
            index: 4,
            text: '다음',
            normalizedSurface: '다음',
            dictionaryForm: '다음',
            pos: 'Noun',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 4,
            length: 2,
          },
        ],
        markedTokenIds: [],
        slashAnchorTokenIds: [],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '다' }));

    const punctuation = screen.getByText('.');
    const slash = screen.getByLabelText('Slash break');
    const nextWord = screen.getByRole('button', { name: '다음' });

    expect(punctuation.compareDocumentPosition(slash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slash.compareDocumentPosition(nextWord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('places a slash at the next space even when content words continue before it', () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '읽고다음 문장',
        tokens: [
          {
            id: '0-0-읽',
            index: 0,
            text: '읽',
            normalizedSurface: '읽다',
            dictionaryForm: '읽다',
            pos: 'Verb',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 0,
            length: 1,
          },
          {
            id: '1-1-고',
            index: 1,
            text: '고',
            normalizedSurface: '고',
            dictionaryForm: '고',
            pos: 'Eomi',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: true,
            offset: 1,
            length: 1,
          },
          {
            id: '2-2-다음',
            index: 2,
            text: '다음',
            normalizedSurface: '다음',
            dictionaryForm: '다음',
            pos: 'Noun',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 2,
            length: 2,
          },
          {
            id: '3-4- ',
            index: 3,
            text: ' ',
            normalizedSurface: ' ',
            dictionaryForm: ' ',
            pos: 'Space',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: false,
            offset: 4,
            length: 1,
          },
          {
            id: '4-5-문장',
            index: 4,
            text: '문장',
            normalizedSurface: '문장',
            dictionaryForm: '문장',
            pos: 'Noun',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 5,
            length: 2,
          },
        ],
        markedTokenIds: [],
        slashAnchorTokenIds: [],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '고' }));

    const nextWord = screen.getByRole('button', { name: '다음' });
    const slash = screen.getByLabelText('Slash break');
    const followingWord = screen.getByRole('button', { name: '문장' });

    expect(nextWord.compareDocumentPosition(slash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slash.compareDocumentPosition(followingWord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not add a slash when no later space or sentence-final punctuation exists', async () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '읽고다음',
        tokens: [
          {
            id: '0-0-읽',
            index: 0,
            text: '읽',
            normalizedSurface: '읽다',
            dictionaryForm: '읽다',
            pos: 'Verb',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 0,
            length: 1,
          },
          {
            id: '1-1-고',
            index: 1,
            text: '고',
            normalizedSurface: '고',
            dictionaryForm: '고',
            pos: 'Eomi',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: true,
            offset: 1,
            length: 1,
          },
          {
            id: '2-2-다음',
            index: 2,
            text: '다음',
            normalizedSurface: '다음',
            dictionaryForm: '다음',
            pos: 'Noun',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 2,
            length: 2,
          },
        ],
        markedTokenIds: [],
        slashAnchorTokenIds: [],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    expect(screen.queryByRole('button', { name: '고' })).not.toBeInTheDocument();
    expect(screen.getByText('고')).toHaveClass('reader-token');
    expect(screen.queryByLabelText('Slash break')).not.toBeInTheDocument();
  });

  it('keeps end-of-text content words as unknown-only toggles', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Korean text'), {
      target: { value: '책 다음' },
    });

    const token = await screen.findByRole('button', { name: '다음' });
    fireEvent.click(token);

    expect(screen.queryByLabelText('Slash break')).not.toBeInTheDocument();
    expect(token).toHaveClass('reader-token--marked');

    fireEvent.click(token);

    expect(screen.queryByLabelText('Slash break')).not.toBeInTheDocument();
    expect(token).not.toHaveClass('reader-token--marked');
  });

  it('restores persisted slash positions on reload', () => {
    window.localStorage.setItem(
      'korean-extensive-reading-tool:v1',
      JSON.stringify({
        rawText: '저는 한국어를 공부합니다.',
        tokens: [
          {
            id: '0-0-저',
            index: 0,
            text: '저',
            normalizedSurface: '저',
            dictionaryForm: '저',
            pos: 'Noun',
            posCategory: 'content',
            isMarkable: true,
            isWordLike: true,
            offset: 0,
            length: 1,
          },
          {
            id: '1-1-는',
            index: 1,
            text: '는',
            normalizedSurface: '는',
            dictionaryForm: '는',
            pos: 'Josa',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: true,
            offset: 1,
            length: 1,
          },
          {
            id: '2-2- ',
            index: 2,
            text: ' ',
            normalizedSurface: ' ',
            dictionaryForm: ' ',
            pos: 'Space',
            posCategory: 'excluded',
            isMarkable: false,
            isWordLike: false,
            offset: 2,
            length: 1,
          },
        ],
        markedTokenIds: [],
        slashAnchorTokenIds: ['0-0-저'],
        timerState: {
          baseElapsedMs: 0,
          elapsedMs: 0,
          isRunning: false,
          lastStartedAt: null,
        },
      }),
    );

    render(<App />);

    expect(screen.getByLabelText('Slash break')).toBeInTheDocument();
  });
});
