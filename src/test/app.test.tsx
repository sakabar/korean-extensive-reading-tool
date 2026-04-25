import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    const excludedToken = await screen.findByText('는');
    expect(excludedToken).toHaveClass('reader-token');
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
        lastClickedTokenId: '0-0-한국어',
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
        lastClickedTokenId: null,
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
});
