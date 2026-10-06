# Rubik's Cube

A 3D Rubik's cube that runs in the browser. You can turn layers by dragging or with the keyboard, save and load cubes, copy a real cube by painting its stickers, and solve a 3x3x3 step by step.

> Status: work in progress.

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

The build output is a plain static site with relative paths, so it can be hosted on any static web server (GitHub Pages, Netlify, an internal server) or in a sub-folder.

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

## License

[MIT](LICENSE). The vendored solver code is MIT-licensed by its authors; see `packages/core/src/solver/vendor/LICENSE`.
