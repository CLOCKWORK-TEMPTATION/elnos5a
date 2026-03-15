# Quickstart: توحيد مراحل الاستقبال

This guide explains how to spin up and test the new Unified Reception Pipeline feature.

## Prerequisites

- No new dependencies or external services are required beyond the existing stack (Node.js, Express, Python for Karank).
- Ensure the backend is running (`pnpm dev` or `pnpm file-import:server`).

## Key Changes to Test

1. **Paste Text**: Paste Arabic text into the editor. The network tab should show a call to the server before the text appears, rather than immediate local processing.
2. **Open `.doc`**: Import an old Word document. It should extract text, send it to the unified endpoint, and render without falling back to a direct UI insert.
3. **Open `.docx`**: Import a modern Word document. It should no longer use `parseDocx` directly; instead, it extracts text and uses the same unified endpoint.
4. **Timeout Simulation**: Temporarily add a sleep to the backend endpoint to exceed 30 seconds and verify that a clear error message appears and no text is inserted.
5. **Logs**: Check the server terminal to verify that pipeline start/end events are being logged in detail.

## Rollout Strategy

This feature replaces core data ingestion logic. It must be thoroughly tested against the E2E suite before merging to main, as any failure here blocks users from using the app.
