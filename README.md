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

## Continuous Integration
- `CI` runs `npm test` and `npm run build` on every `push` and `pull_request`.
- `Versioning` supports manual semantic version bumps on `develop`, then creates the tag and GitHub Release after the version reaches `main`.
- `Deploy Pages` publishes the built `dist/` output to GitHub Pages on every `main` push by using the official Pages deployment actions.

## Deployment Note
- `vite.config.ts` uses `base: "/korean-extensive-reading-tool/"` for GitHub Pages repository subpath hosting.
- Before the first deployment, open `Settings > Pages` and set `Build and deployment > Source` to `GitHub Actions`.
- GitHub Pages should be configured to deploy from GitHub Actions rather than a `gh-pages` branch.
- If `actions/configure-pages` fails with `Get Pages site failed` or `Not Found`, the repository Pages site is usually not enabled yet or the source is still not set to `GitHub Actions`.

## License

This project is licensed under the MIT License.

The favicon source image `bunbougu_marker.png` and the derived favicon assets in `public/` are excluded from the MIT License.
