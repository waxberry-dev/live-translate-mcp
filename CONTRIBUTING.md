# Contributing to live-translate-mcp

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo and clone it locally
2. `npm install`
3. `npm run build` to compile TypeScript
4. `npm test` to run the test suite

## Development

The MCP server is a single TypeScript package. Key files:
- `src/` — server source code
- `tests/` — vitest tests

To test locally with Claude Desktop, update your `claude_desktop_config.json`
to point to your local build:

```json
{
  "mcpServers": {
    "live-translate": {
      "command": "node",
      "args": ["/absolute/path/to/your/clone/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key"
      }
    }
  }
}
```

## Submitting Changes

- Open an issue before starting work on large changes
- Keep PRs focused — one feature or fix per PR
- Add tests for new functionality
- Make sure `npm test` passes

## Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS, Node.js version, and Claude Desktop version
- Whether espeak-ng is installed

## License

By contributing, you agree that your contributions will be licensed
under the MIT License.
