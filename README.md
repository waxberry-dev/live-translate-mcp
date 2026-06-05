# live-translate-mcp

**Real-time English ↔ Mandarin speech translation for Claude — powered by Whisper, Claude AI, and Piper TTS.**

Give Claude the ability to listen, translate, and speak. `live-translate-mcp` is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that adds speech translation as a native tool inside Claude Desktop and Claude Code. Hand it an audio file, and it transcribes, translates, synthesises, and plays the result — entirely on your machine, with Claude handling the translation.

---

## What it does

| Step | Technology | Where it runs |
|------|-----------|---------------|
| Speech → Text | [OpenAI Whisper](https://github.com/openai/whisper) (via `@huggingface/transformers`) | Local |
| Text → Translation | [Claude](https://anthropic.com/claude) (Opus 4.8) | Anthropic API |
| Translation → Speech | [Piper TTS](https://github.com/rhasspy/piper) (ONNX) | Local |

Audio never leaves your machine except for the translated text sent to the Claude API. ASR and TTS run fully on-device.

---

## Tools

### `translate_file`

Translate a WAV audio file. Pass an absolute path — the server transcribes it, translates the text via Claude, synthesises speech, saves `<name>_translated.wav` next to the original, and plays it automatically.

```
Translate /Users/alice/meeting_clip.wav
```

**Returns:** original text, translation, and the path to the saved output file.

### `translate_speech`

Translate raw audio passed as a base64-encoded WAV string. Returns the transcription, translation, and synthesised audio as base64 WAV — useful for programmatic workflows.

### `health_check`

Verify that all dependencies (Whisper model cache, Piper voice files, `espeak-ng`) are present and ready before making a translation request.

---

## Installation

No installation required. Run it directly with `npx`:

```bash
npx -y live-translate-mcp
```

Or install globally:

```bash
npm install -g live-translate-mcp
```

**Prerequisites:**
- Node.js 18+
- An Anthropic API key
- `espeak-ng` — for TTS phonemisation (`brew install espeak-ng` on macOS, `apt install espeak-ng` on Linux)

The Whisper model (~150 MB) and Piper voice models (~200 MB) download automatically on first use and are cached in `~/.live-translate/`.

---

## Claude Desktop setup

Add the following to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "live-translate": {
      "command": "npx",
      "args": ["-y", "live-translate-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see `live-translate` appear in the tools panel.

---

## Claude Code setup

```bash
claude mcp add live-translate -- npx -y live-translate-mcp
```

Then set your API key in the environment before starting Claude Code, or pass it via the MCP env config.

---

## Usage examples

Once configured, just ask Claude naturally:

> "Translate this audio file for me: /Users/alice/recording.wav"

> "Use translate_file on /tmp/interview.wav"

> "Check if live-translate is ready"

Claude will call the appropriate tool automatically.

---

## Supported languages

| Language | ASR | Translation | TTS |
|----------|-----|-------------|-----|
| English | ✓ | ✓ | ✓ |
| Mandarin Chinese (普通话) | ✓ | ✓ | ✓ |

Language is detected automatically from the audio — no need to specify it.

---

## How it compares

| | live-translate-mcp | Cloud speech APIs |
|--|--|--|
| ASR | Local (Whisper) | Remote |
| Translation | Claude API | Remote |
| TTS | Local (Piper) | Remote |
| Audio privacy | Audio stays on device | Audio uploaded |
| Cost | Claude API only | Per-minute pricing |
| Offline | Partially (ASR + TTS) | No |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | **Required.** Your Anthropic API key. |
| `PIPER_VOICE_DIR` | `~/.live-translate/voices` | Path to Piper `.onnx` voice files. |

---

## Related

- **[live-translate](https://github.com/waxberry-dev/live-translate)** — the standalone CLI for push-to-talk translation with no API key required, using local models end-to-end.
- [Model Context Protocol](https://modelcontextprotocol.io) — the open standard this server implements.
- [Piper TTS](https://github.com/rhasspy/piper) — the local TTS engine powering speech synthesis.

---

## Licence

MIT
