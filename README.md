# Rubik's Cube

A 3D Rubik's cube that runs in the browser. You can turn layers by dragging or with the keyboard, save and load cubes, copy a real cube by painting its stickers, and solve a 3x3x3 step by step.

> Status: work in progress.

**Live app:** https://rupeshbhurke.github.io/rubiks-cube/

## Features

- Realistic 3D cube (black body, rounded stickers) with smooth, queued turn animations.
- Drag a sticker to turn its layer; a quick flick finishes the turn. Drag the background to look around.
- Keyboard notation (`U D R L F B M E S X Y Z`, Shift for counter-clockwise), undo and redo. Press `?` for a floating key guide that stays open beside the cube and lights up each key as you press it.
- Cube sizes 2x2x2 to 7x7x7.
- Scramble, full move history, replay, and jump to any point in the history.
- Solver for the 3x3x3 (Kociemba two-phase, about 20 moves) with a step-by-step explanation of each move.
- Paint mode to copy a physical cube. The app checks that the painted cube can really exist (color counts, impossible pieces, twisted corners, flipped edges, swapped pieces).
- Saves in the browser, export and import as `.json` files, and share links. Saves keep the starting state and every move, so they can be replayed.
- Works with mouse and touch; the layout adapts to phone screens.

## Run

Needs Node.js 20 or later.

```bash
npm install
npm run dev        # start the app at http://localhost:5173
npm test           # unit tests for the puzzle logic
npm run typecheck
npm run build      # static site in apps/web/dist
```

The build output is a plain static site with relative paths, so it can be hosted on any static web server or in a sub-folder.

## Deploy

The app is hosted on GitHub Pages. The workflow in `.github/workflows/deploy.yml` runs on every push and pull request:

1. Install dependencies, typecheck, run the unit tests and build.
2. Deploy `apps/web/dist` to GitHub Pages, only for pushes to `main` or a manual run.

To deploy by hand, open the repository's **Actions** tab, choose **Build and deploy**, then **Run workflow**. GitHub Pages must be set to deploy from **GitHub Actions** (repository **Settings → Pages → Source**).

## Project layout

npm workspaces with two packages:

| Path | What it holds |
|------|---------------|
| `packages/core` | Platform-independent puzzle logic in TypeScript, with no DOM or rendering code. It can be shared with a future mobile app. |
| `apps/web` | The browser app: Vite, React (panels) and Three.js (3D view). |

### `packages/core`

- `types.ts`: the `Puzzle` interface that every puzzle type implements (state, moves, notation, scramble, validation).
- `cube/`: the NxN cube. A state is one color per sticker, in Kociemba facelet order (U, R, F, D, L, B). Moves are sticker permutations generated from 3D geometry, so every size works the same way. `cube3.ts` adds the full 3x3x3 solvability checks.
- `session.ts`: starting state, move history and cursor (undo, redo, seek).
- `save.ts`: the versioned JSON save format and the share-link encoding.
- `solver/`: the 3x3x3 solver. It uses [cubejs](https://github.com/ldez/cubejs) (MIT), vendored in `solver/vendor` as ES modules.

### `apps/web`

- `view/CubeView.ts`: the Three.js scene. A turn rotates the affected cubies in a pivot group, then resets them and recolors the stickers from the new state, so the view always matches the model.
- `view/CubeInteraction.ts`: pointer input for turning layers and painting stickers.
- `controller/AppController.ts`: connects the session, animation queue, solver worker and storage. React components read snapshots from it.
- `solver/`: runs the solver in a Web Worker so the page never freezes.
- `storage/SaveStore.ts`: saves in `localStorage`.

## Adding a new puzzle type

1. Implement `Puzzle` for the new puzzle in `packages/core` and register it in `puzzles.ts` (`PuzzleDescriptor`, `getPuzzle`).
2. Add a view for it in `apps/web/src/view`.
3. Make `AppController` choose the view by puzzle kind. It is written against the cube types today.

Saves and share links already record the puzzle type, so they work for new puzzles without format changes.

## Roadmap

Status as of October 2026. Items move to **Features** when they are done.

### Planned features

- **More puzzles: Pyraminx, Skewb and Megaminx.** Each needs its puzzle logic, scramble and 3D view in `packages/core` and `apps/web` (see [Adding a new puzzle type](#adding-a-new-puzzle-type)). `AppController` and the side panels also need to stop assuming a cube.
- **2D unfolded net view.** Not yet decided: a net beside the 3D cube, a net only in paint mode, or a switch between the two.
- **Guided beginner solve.** The current solver gives short computer solutions that are hard to follow. A layer-by-layer guide would teach each stage in plain language, for example "make the white cross", and would better serve the learning goal.
- **Logic shared with the mobile app.** The mobile app will live in a separate repository and should reuse `packages/core`. The package needs a build step to JavaScript plus type definitions. It also needs a way to share it: a private npm package, a git dependency, or moving the mobile app into this repository.

### Known gaps

- **Solver covers the 3x3x3 only.** A 2x2x2 solver is straightforward to add; 4x4x4 and larger are much harder.
- **Big-cube controls.** On 4x4x4 and larger there are no keys or buttons for wide or inner-slice turns, and dragging turns one layer at a time.
- **Paint mode limits.**
  - Center colors are fixed: white on top, green in front.
  - Only the standard color scheme is supported.
  - On sizes other than 3x3x3 it checks color counts only.
- **No automated tests for the web app.** `packages/core` has unit tests, but the UI was checked by hand and with one-off browser scripts. CI runs the unit tests and the build on every push; end-to-end browser tests (for example Playwright) still need adding.
- **Not yet tested on real devices.** Drag feel, animation speed and touch handling need checking on real computers and phones.
- **Bundle size.** The app ships as one 864 KB script (233 KB gzipped). Splitting Three.js and React into separate chunks would speed up the first load.
- **Saves stay in one browser.** Saves use `localStorage` behind `SaveStore`, so they can move to IndexedDB or cloud storage later.

### Open decisions

- Keep or remove the **Keys** tab, now that the floating key guide (`?`) shows the same list.
- Choose how the mobile app gets `packages/core`.

### Suggested order

1. Test on real devices.
2. Build the guided beginner solve.
3. Package `packages/core` for the mobile app.
4. Add the new puzzle types.

## License

[MIT](LICENSE). The vendored solver code is MIT-licensed by its authors; see `packages/core/src/solver/vendor/LICENSE`.
