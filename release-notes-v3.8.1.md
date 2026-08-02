## What's New in v3.8.1

### Changed
- **Improved translation prompts (PR #18)**: Merged enhanced system prompts with prompt-injection guards, hallucination prevention for dictionary lookups, and expanded dictionary fields (pronunciation, collocations, etymology).
- **Restored Reasoning: low**: Re-added `Reasoning: low` to the V2 translate and dictionary prompts to maintain reduced reasoning overhead and first-token latency.
- **Site access permissions**: Extended optional host permissions to cover `http://*/*`, enabling the "On all sites" option in browser extension settings.
- **Code cleanup**: Removed the superseded `buildSystemPrompt` function (dead code after V2 merge).

### Assets
- `ai-translator-v3.8.1.zip` — Extension package for Edge Add-ons.

**Full Changelog**: [CHANGELOG.md](https://github.com/OpenTester007/Chat-with-KB/blob/main/CHANGELOG.md)
