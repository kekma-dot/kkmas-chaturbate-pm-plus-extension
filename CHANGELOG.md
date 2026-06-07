# Changelog

## 0.5.2 Beta - 2026-06-07

- Fixed Chaturbate emoticon and emoji rendering in PM+ message bubbles.
- Added a safe PM photo attachment bridge: inbound photos render as `Photo received` cards instead of `New` text placeholders.
- Rendered the already-visible native PM photo thumbnail in blur inside PM+, without unblurring or fetching full-size media.
- Added explicit `Open photo` handling through the native Chaturbate PM action, with rapid-click protection.
- Preserved privacy boundaries: no PM photo downloads, unblurring, direct fetches, raw media URLs, tokens, or DOM refs in ChatStore.

## 0.5.1 Beta - 2026-06-06

- Added an opt-in network diagnostics probe for controlled Chaturbate PM debugging.
- Added deterministic redaction for network metadata: no PM text, usernames, tokens, cookies, raw URLs, or full payloads.
- Added a pure `ChatStore` module for future DOM/network message merging without storing DOM nodes.
- Kept the normal extension runtime DOM-only when diagnostics are disabled.

## 0.5 Beta - 2026-06-06

- Rebranded the extension as `KKMA's Chaturbate PM+ Extension`.
- Added privacy-redacted, PM-scoped media diagnostics for the PM photo live spike.
- Kept PM photo handling DOM-only and blocked behind controlled-account diagnostics.
- Preserved explicit user action for opening PM windows through the native Chaturbate popover.
- Added `dist/kkmas-chaturbate-pm-plus-extension-0.5-beta.zip` as the browser install package.
