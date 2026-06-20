# Changelog

All notable changes to this project will be documented in this file.

## [3.5.1] - 2026-06-20

### Added
- English README with screenshots and installation guide
- CODE_OF_CONDUCT.md (Contributor Covenant v2.0)
- CHANGELOG.md (this file)

### Changed
- README rewritten in English

## [3.5.0] - 2026-06-20

### Added
- Model preset dropdown with four models (gpt-oss-20b, deepseek-v4-flash, llama-3.3-70b-instruct, gemma-4-31b-it)
- Reviewer notice comments explaining embedded API key for Edge Store compliance
- privacy-policy.html for Edge Store submission
- LICENSE (MIT)
- CONTRIBUTING.md
- ROADMAP.md

### Fixed
- Fixed translation output leaking `<think>` reasoning content in streaming and non-streaming paths
- reasoning_content is now only prefixed for chat mode; translation/polish/dictionary return clean text

### Changed
- Unified API parameters: temperature=0.7, top_p=1, max_tokens=4096 for all model types
- `callAPI` contract: chat returns `<think>` prefix, non-chat returns plain text

## [3.4.7] - 2026-06-20

### Changed
- Aligned API call parameters with NVIDIA gpt-oss-20b official spec: temperature=1, top_p=1, max_tokens=4096

## [3.4.6] - 2025-06-12

### Added
- AI translation for Chinese, English, Japanese, Korean
- Text polishing with language detection and Chinese revision notes
- Bilingual dictionary lookup with etymology and examples
- AI chat with streaming support and conversation history
- History records (last 10 items)
- Customizable API key, endpoint, and model settings
- Support for NVIDIA Build API and custom OpenAI-compatible endpoints
