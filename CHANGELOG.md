# Changelog

## 1.1.0 — 2026-09-28

- Restore connection state and subscriptions after automatic reconnection.
- Settle cancelled and timed-out connection attempts; stop retrying failed initial connections.
- Preserve leading, trailing and consecutive slashes in MQTT topics.
- Batch topic tree refreshes and synchronize the visual editor with filtering and clearing.
- Add the missing Copy Topic as JSON command, including message metadata.
- Dispose tree refresh timers and live panels when the extension stops.
- Add regression tests (`npm test`) and compile automatically before packaging.
- Resolve leftover merge markers in the dependency lockfile.

## 1.0.3 — 2026-03-26
### Additions
- **New command**: `MQTT Explorer: Copy Topic as JSON` to copy the topic and payload as a JSON object to the clipboard, for easy sharing or debugging.


## 1.0.2 — 2026-03-26

### Additions
- **Visual Topic Editor**: New interactive panel (`MQTT Explorer: Open Topic Tree Editor`) displaying the topic tree in real time with filtering, message details (QoS, Retain, timestamp), payload preview, and one-click topic copying.

- **Icons on all commands**: Each command now has a Codicon icon in the palette and in the view bar.

- **View menu reorganization**: Only 3 essential buttons remain as icons in the bar (Connect, Topic Editor, Publish); the other commands are grouped in the `...` menu by category (connection, filter).

### Fixes
- **Connection profile selection**: Fixed a bug where clicking on a saved profile did not select it (the inline `onclick` handlers were blocked by the Webview's CSP). Replaced by `data-attribute` + `addEventListener`.

## 1.0.0

- Premiere version : connexion MQTT, arbre des topics, inspection et publication.
