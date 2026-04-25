# Korean Extensive Reading Tool

Static single-page app for Korean extensive reading practice.

## Features
- Paste one Korean passage and read it token by token
- Mark unknown content words with one click
- Exclude particles, endings, and other function words from unknown-word ratios
- See total words, character count, full-text ratio, and ratio to the last clicked token
- Track reading time with start, stop, and reset
- Restore text, marks, progress, and timer state from `localStorage`

## Development
```bash
npm install
npm run dev
```

## Verification
```bash
npm test
npm run build
```

## Deployment Note
- `vite.config.ts` uses `base: "/korean-extensive-reading-tool/"` for GitHub Pages repository subpath hosting.
