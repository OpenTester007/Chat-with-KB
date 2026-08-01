## What's New in v3.8.0

### Changed
- **Prompt optimization for gpt-oss-20b**: Added `Reasoning: low` to the translate and dictionary system prompts to reduce unnecessary reasoning overhead and first-token latency on the default reasoning model.
- **Concise translate prompt**: Rewrote the translation system prompt as a short affirmative instruction, replacing negative phrasing with positive directives for better instruction-following on a 20B model.
- **Structured polish output**: Restructured the text polishing prompt into a two-section format (`【润色后】` / `【修改说明】`) for consistent, parseable results.
- **Dictionary template**: Converted the dictionary prompt from a numbered list to a fixed markdown field template to eliminate output format drift across queries.
- **Temperature tuning**: Lowered the sampling temperature from 0.7 to 0.5 globally for improved translation and dictionary output consistency.

### Assets
- `ai-translator-v3.8.0.zip` — Extension package for Edge Add-ons.

**Full Changelog**: [CHANGELOG.md](https://github.com/OpenTester007/Chat-with-KB/blob/main/CHANGELOG.md)
