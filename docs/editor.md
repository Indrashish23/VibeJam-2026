# Vibe Jam Scene Editor

The scene editor lives inside the same Electron exe as the game. It shares the game's
Three.js scene / camera / renderer and hot-applies edits to the running game on Save
and Close. One exe, two modes — no restart, no separate pipeline.

## Activation

| Trigger                            | Effect                                               |
| ---------------------------------- | ---------------------------------------------------- |
| `vibejam.exe --editor`             | Open the editor overlay on boot.                     |
| `npm run electron:editor`          | Dev alias — launches Vite + Electron with `--editor`.|
| `F12`                              | Toggle editor open / closed at any time.             |
| Editor's **▶ Play** button         | Close editor, resume combat.                         |

While the editor is open: combat, AI, pointer lock, and the HUD are suspended.
Closing the editor resumes everything; the last Save has already hot-applied to the
game so you walk into the edited scene immediately.

## File layout

```
VibeGameJam/
├── electron/
│   ├── main.cjs        - argv parse, scenesDir, IPC handlers
│   └── preload.cjs     - window.editorBridge bridge
├── src/
│   ├── main.ts         - F12 hook, gameApi export, combat gate
│   ├── maps.ts         - loadArenaFromGlbUrl (editor-consumable)
│   └── editor/
│       ├── mount.ts    - overlay entry point
│       ├── EditorAPI.ts
│       ├── types.ts
│       ├── commands.ts / CommandStack.ts
│       ├── SceneStore.ts / EventBus.ts
│       ├── registries/ - EntityType / Component / Asset
│       ├── io/         - bridgeFs (Electron IPC + HTTP fallback)
│       ├── builtins/   - entityTypes / components / vibejamTypes / assets
│       ├── translators/- arena / spawn / banana hot-apply
│       └── ui/         - Shell / ViewportHost / SceneTree / Inspector / Toolbar / AssetPanel / PropertyField / AddEntityModal / styles.css
└── Assets/
    └── Scenes/         - *.json scenes live here (next to the exe in prod)
```

## Scene file format

Every scene saves as `Assets/Scenes/<name>.json` with this shape:

```json
{
  "version": 1,
  "name": "example",
  "entities": [
    {
      "id": "uuid-here",
      "name": "Arena Stage",
      "type": "arena_stage",
      "parentId": null,
      "children": [],
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1.7, 1.7, 1.7]
      },
      "properties": { "meshUrl": "…arena_export.glb" },
      "components": [],
      "metadata": { "__isArena": true }
    }
  ],
  "metadata": {}
}
```

Unknown `entity.type` on load falls back to `empty` with the original type preserved
in `metadata.__unknownType` — you can upgrade an older scene incrementally.

## Hot-apply (translators)

Every Save and editor Close fires `EditorAPI.onSceneApply(sceneFile)`. The game-side
registration in `src/editor/translators/index.ts` runs the day-1 translators in order:

1. **`arenaTranslator`** — `arena_stage` or flagged `static_mesh` → rebuild Rapier terrain
   via `loadArenaFromGlbUrl`, swap `MapHandle`. Diffed by URL + transform so unrelated
   edits don't trigger a teleport.
2. **`spawnTranslator`** — `player_spawn` entities → monkey-patch current MapHandle's
   `getPlayerSpawn` / `getBotSpawn` / `getRespawnFootCandidates` closures. Sorted by
   `properties.spawnIndex`; missing slots fall back to the GLB's built-in spawns.
3. **`gameApi.spawnActors` + `warpRapierCapsulesToCurrentActors`** — only if arena or
   spawns changed.
4. **`bananaTranslator`** — `pickup` (banana) or `banana_pickup_node` → clear the
   `BananaWorld` and call `applyInitPickups` with the editor-authored positions.

Translators for `character`, `projectile_def`, `audio_emitter`, `zone_trigger`, and
the portal/megaphone props are deferred — the editor places them and serializes them,
the game ignores them until a matching translator lands. Adding one is a single file
in `src/editor/translators/` and a line in `translators/index.ts`.

## Plugin API

A plugin is any object matching `EditorPlugin`:

```ts
interface EditorPlugin {
  id: string
  onRegister(api: EditorAPI): void
}
```

Register by pushing onto `window.__editorPlugins` **before** the editor mounts:

```ts
;(window.__editorPlugins ||= []).push({
  id: 'my-plugin',
  onRegister(api) {
    /* Register a new entity type, backed by your own default properties + schema. */
    api.entityTypes.register({
      id: 'my_waypoint',
      label: 'Waypoint',
      icon: '📍',
      defaultProperties: { label: '' },
      schema: [{ key: 'label', label: 'Label', type: 'string' }],
    })

    /* Attach a button to the top toolbar. */
    api.ui.addToolbarButton({
      id: 'my-plugin.dump',
      label: 'Dump scene',
      onClick: () => console.log(api.scene.getAll()),
    })

    /* Run logic on Play. */
    api.onPlay(() => console.log('[my-plugin] user hit Play'))

    /* Run logic on Save / Close (same payload your game-side translators get). */
    api.onSceneApply((scene) => {
      console.log('[my-plugin] scene has', scene.entities.length, 'entities')
    })
  },
})
```

The editor also exposes itself as `window.EditorAPI` for ad-hoc devtools use.

## Keyboard shortcuts

| Key              | Action                                     |
| ---------------- | ------------------------------------------ |
| `F12`            | Toggle editor                              |
| `W` / `E` / `R`  | Gizmo: translate / rotate / scale          |
| `F`              | Frame selected in viewport                 |
| `Delete`         | Delete selected entity                     |
| `Ctrl+Z`         | Undo                                        |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo                                |
| `Ctrl+S`         | Save scene (fires hot-apply)               |

## Round-trip acceptance test

Manual, end-to-end, day-1 test that the editor is actually wired to the game:

1. Start the app with `npm run electron:editor` (or press `F12` once in-game).
2. Verify the editor chrome is visible (left scene tree, right inspector, bottom asset panel, top toolbar).
3. From the bottom asset panel's **Models** tab, drag `Arena` onto the viewport centre.
   A new `static_mesh` entity should appear in the tree.
4. Select the entity in the tree. In the inspector: change its type to `arena_stage` by deleting it and using **Scene Tree → + → Arena Stage** (one-click creation). Set
   transform position `(0, 0, 0)`, scale `(1.7, 1.7, 1.7)`. The arena mesh should
   render in the viewport.
5. In the tree, click `+` → **Player Spawn** twice. Select the first, set position to
   `(-8, 1, 0)` and `spawnIndex` to `0`. Select the second, set `(8, 1, 0)` and
   `spawnIndex` to `1`.
6. Drag `Banana Pickup` from the asset panel three times onto the deck. Each becomes
   a `static_mesh`; **Scene Tree → + → Banana Pickup** adds a proper `banana_pickup_node`
   instead — use that for interactive bananas.
7. Toolbar → **Save**. Confirm a filename (e.g. `test.json`). A file
   `Assets/Scenes/test.json` appears on disk. The scene rebuilds immediately under the
   paused game.
8. Toolbar → **▶ Play** (or press `F12`). Editor closes, combat resumes. Verify:
   - Player spawns at `(-8, 1, 0)`.
   - Bot spawns at `(8, 1, 0)`.
   - Three bananas sit on the deck where you placed them.
   - Walking into a banana fires the pickup.
9. Re-open the editor (`F12`), toolbar → File dropdown → pick `test.json`. Scene
   round-trips back identically.

If any step fails, the single-translator fault is typically visible in the devtools
console under `[editor:translator]` or `[map:arena]` logs.
