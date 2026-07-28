# Codex for Open Source — Application Text

> Use the sections below to fill out the OpenAI Codex for OSS application form. Each block is written in English and can be copied directly into the matching form field.

---

## 1. Maintainer Role / Who maintains this repository?

I am the author and primary maintainer of **AI-based Translator** (`OpenTester007/Chat-with-KB`). I am responsible for the full project lifecycle: triaging issues, reviewing and merging pull requests, maintaining the CHANGELOG and ROADMAP, cutting releases, and publishing updates to the Microsoft Edge Add-ons store.

---

## 2. Why does this repository qualify? / Project Description

### Short version (use if the field has a ~1000 character limit)

AI-based Translator is an open-source, Manifest V3 browser extension for Chinese, English, Japanese, and Korean AI translation, polishing, dictionary, and chat. It is published on the Microsoft Edge Add-ons store and actively maintained by a single core maintainer.

The extension lowers the barrier to LLM translation through a one-click **"导入测试密钥" (Import Test Key)** feature, which provides a working demo key over HTTPS or a local fallback so users can test immediately without registration.

The project is MV3-compliant, uses a strict CSP and safe DOM rendering to mitigate XSS, and supports NVIDIA Build, OpenAI-compatible endpoints, and local Ollama. Maintenance is transparent: regular GitHub releases, PR reviews, issue triage, and Edge Store updates from v3.4.6 to v3.7.0.

### Full version (use if the field allows ~2000 characters)

**AI-based Translator** is an open-source, Manifest V3 browser extension that provides AI-powered translation, text polishing, bilingual dictionary, and chat for Chinese, English, Japanese, and Korean. It is published on the Microsoft Edge Add-ons store and is actively maintained.

The project solves a real friction point: most LLM-powered translation tools require users to register, obtain an API key, and configure endpoints before they can translate a single sentence. AI-based Translator ships with a one-click **"导入测试密钥" (Import Test Key)** feature that fetches a working demo key over HTTPS or falls back to a local encoded copy, enabling zero-config onboarding for non-technical users.

Technical highlights:

- **Manifest V3 compliant**: strict CSP, no inline scripts or styles, safe DOM rendering to mitigate XSS.
- **Non-blocking background service worker**: translations and chats continue even after the popup is closed, with results saved to local history.
- **Flexible API support**: works with NVIDIA Build API, any OpenAI-compatible endpoint, and local Ollama.
- **Open-source governance**: MIT license, CHANGELOG, CONTRIBUTING, ROADMAP, and CODE_OF_CONDUCT.

Maintenance is transparent and continuous. Since the repository was created in early 2026, it has moved from v3.4.6 to v3.7.0 with regular GitHub releases, PR reviews, issue triage, and Edge Store updates. I am the primary maintainer and handle all release management, documentation, security fixes, and store publishing.

The project matters to its ecosystem because it lowers the barrier for Chinese-speaking users to access LLM translation tools. It also serves as a reusable reference for building secure, MV3-compatible browser extensions that integrate with OpenAI-compatible APIs.

---

## 3. How will you use API credits?

I would use API credits to support maintainer workflows for AI-based Translator, including:

1. **Pull request review**: catching MV3 CSP, security, and cross-browser compatibility issues in code changes.
2. **Issue triage**: summarizing user-reported bugs and feature requests to respond faster and more accurately.
3. **Documentation and release notes**: keeping the README, CHANGELOG, and certification notes in sync across releases.
4. **Automated checks**: generating and running validation scripts for browser extension packaging and API integration.

This would help me sustain the project as a solo maintainer and keep the release quality high as the user base grows.

---

## 4. Codex Security (if asked)

If approved for Codex Security, I would use it only on repositories I maintain or have explicit authorization to review, primarily to inspect the extension's JavaScript, CSP configuration, and API integration for security issues, unsafe patterns, and dependency risks.

---

## 5. Anything else we should know?

The "Import Test Key" feature is intentionally designed as a public demo key. It is not a leaked credential; it is a core product decision to let anyone test the extension immediately without registering for an API key. This is documented in the README and CHANGELOG.

The project is small but growing, with a clear focus on active maintenance and real-world usability rather than being a one-off demo. I am committed to keeping it updated, secure, and useful for its users.
