<p align="center">
  <img src="assets/github-logo-lockup.svg" alt="KKMA's Chaturbate PM+ Extension" width="900">
</p>

# KKMA's Chaturbate PM+ Extension

Private beta Chrome extension for multi-window PM chats on Chaturbate.

Version: `0.5 Beta` (`0.5.0` in `manifest.json`).

## What works now

- Injects a `PM+` action into the native Chaturbate user popover.
- Opens up to 4 floating PM windows at once when the viewport has enough usable width.
- Pins chat windows to the bottom of the page, Stripchat-style.
- Supports minimize, close, unread counters, and local UI-state persistence.
- Supports multiline compose input that grows while typing long messages and preserves caret position after focus leaves the extension.
- Preserves Chaturbate emoticon shortcuts such as `:heart` when sending through the native PM input.
- Shows a small emoticon autocomplete menu in the demo and, on Chaturbate, reads real suggestions from the page-owned `/api/ts/emoticons/autocomplete/` endpoint.
- Does not auto-open generic native PM roots such as `PM 1`; floating user PM windows open from an explicit `PM+` action.
- Trims extra floating windows on zoom/resize when they cannot fit cleanly; unsent drafts from trimmed windows stay only in page memory.
- Works on the included demo page through `data-cbm-*` attributes.
- Includes a cautious Chaturbate DOM adapter that tries to read visible PM-like DOM only.
- Emits privacy-redacted, PM-scoped media diagnostics for the next photo spike.

## What this prototype does not do

- Does not store passwords, cookies, tokens, payment data, camera, or video.
- Does not send PM text to any server.
- Does not automate mass messaging.
- Does not call third-party servers for PM or emoticon data.
- Does not download, unblur, save, copy, or directly fetch PM photos or media URLs.

## Install locally

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the cloned repository folder or an extracted release ZIP folder that contains `manifest.json`.

```text
kkmas-chaturbate-pm-plus-extension
```

## Test with demo page

1. In `chrome://extensions`, open this extension's details.
2. Enable `Allow access to file URLs`.
3. Open the demo page from the repository:

```text
demo/demo.html
```

4. Find the native-like user popover in the right column.
5. Click `PM+`.
6. Click `Simulate incoming PM` to test unread updates.
7. Type `:h` in the PM+ compose input, then use `ArrowDown` and `Enter` to insert a demo emoticon shortcut.
8. Type a long message in the compose input and check that it wraps into multiple lines instead of sliding horizontally.

## Next real-site spike

1. Open the Chaturbate broadcaster page in Chrome with the extension loaded.
2. Click a member nickname in the native users/chat list.
3. In the native Chaturbate popover, click `PM+`.
4. Check that a bottom-docked chat window opens for that username.
5. Open the native `Send private message` or `Send direct message` action once.
6. Run the page-console bridge in DevTools:

```js
document.dispatchEvent(new CustomEvent("CBM_COPY_DIAGNOSTICS"));
document.documentElement.getAttribute("data-cbm-diagnostics");
```

7. Update `src/chaturbate-adapter.js` selectors from the sanitized diagnostics output.

If you switch the DevTools console context from the page to the extension content script, this
direct helper also works:

```js
window.CBMultichatDebug.diagnosticsText();
window.CBMultichatDebug.layoutDiagnostics();
```

## PM photo diagnostic spike

Photo support is not shipped yet. The safe next step is to collect sanitized native PM media
diagnostics with two controlled accounts before adding attachment parsing or UI cards.

1. Account A sends one harmless test image to Account B through native Chaturbate PM.
2. On Account B, do not open the photo yet.
3. Run:

```js
document.dispatchEvent(new CustomEvent("CBM_COPY_DIAGNOSTICS"));
document.documentElement.getAttribute("data-cbm-diagnostics");
```

4. Save the sanitized JSON and a screenshot of the native PM opened/unopened state.
5. Open the photo using native Chaturbate UI only.
6. Run the same diagnostics again.
7. Confirm whether Account A sees the same opened-state transition as a normal native open.

The JSON may include `mediaCandidates` with counts, class tokens, rectangles, status kinds,
control kinds, and hashed image hosts. It must not include raw PM text, usernames, `src`, `href`,
blob/base64 data, URL tokens, or full media URLs.

## Diagnostics privacy contract

`src/diagnostics.js` emits selector candidates, dimensions, class tokens, hashed ids, input/control
kinds, and message-like counts. It must not emit raw message text, usernames, page titles, cookies,
tokens, or raw URLs.

For emoticons, diagnostics also emits only visible popup structure: selector classes, dimensions,
child/item counts, item classes, and hashed preview image hosts. It must not emit surrounding PM
text or raw popup text. Runtime autocomplete calls Chaturbate's own page endpoint and caches only
session suggestions returned by Chaturbate.

For PM media, diagnostics is scoped to PM candidate roots/message rows only. It reports structural
media candidates and hashed image hosts so we can learn the DOM shape without collecting images,
raw media URLs, or private message contents.

## Current known gap

The extension now has a first native Chaturbate PM bridge based on live diagnostics:

- PM root: `.ChatTabContents.TheatermodeChatDivPm`
- message list: `.msg-list-fvm.message-list`
- message nodes: `.msg-text`
- PM input: `.theatermodeInputFieldPm[contenteditable="true"]`
- send button: `button.SendButton.SplitMode.pm`

The next real-site check is whether reload keeps generic `PM 1` windows closed, clicking
`PM+` opens only the selected username, send stays fully visible at different browser zoom
levels, extra windows close cleanly when the viewport cannot fit them, and `:h` still returns
Chaturbate API suggestions. PM photo UI must wait until the controlled-account media diagnostic
spike proves a safe DOM-visible attachment shape and native opened-state behavior.
