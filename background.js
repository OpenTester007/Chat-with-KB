const DEFAULT_API_KEY = '';
const DEFAULT_API_ENDPOINT = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

const MAX_HISTORY_ITEMS = 10;
const MAX_CHAT_HISTORY_TURNS = 5;
const ALLOWED_OPERATION_TYPES = new Set(['translate', 'polish', 'dictionary', 'chat']);

function isLocalEndpoint(url) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

function normalizeEndpoint(rawEndpoint) {
  const endpoint = rawEndpoint || DEFAULT_API_ENDPOINT;
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalEndpoint(url))) {
    throw new Error('API 端点必须使用 HTTPS，或使用本机 http://localhost / http://127.0.0.1。');
  }
  return url.toString().replace(/\/$/, '');
}

function buildSystemPrompt(operationType, targetLangValue) {
  if (operationType === 'chat') {
    return '你是一位 AI 助手，请使用与用户相同的语言简洁回复。';
  }

  if (operationType === 'polish') {
    return `
你是一位专业的双语编辑，擅长文本润色。
当用户提供一段文本时：
1. 识别文本的原始语言。
2. 使用与原文完全相同的语言润色，使其更流畅、准确，并保持原意。
3. 最后用中文简要说明关键修改及原因。
请直接处理用户接下来的输入。
`;
  }

  if (operationType === 'dictionary') {
    return `
你是一位中英双语词典助手，擅长词义和词源分析。
对于用户输入的单词或短语，请给出：
1. 中文释义。
2. 英文释义。
3. 主要词性。
4. 词根、前缀、后缀分析；如果不适用，请说明无明显词根词缀。
5. 1-2 个中英双语例句。
请确保输出清晰、准确、易懂。
`;
  }

  const langMap = { zh: '中文', en: '英文', ja: '日语', ko: '韩语' };
  const targetLanguage = langMap[targetLangValue] || '中文';
  return `你是一位专业的翻译引擎。请自动检测用户输入文本的源语言，然后准确翻译成【${targetLanguage}】。请直接输出翻译结果，不要包含额外说明或源语言识别信息。`;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'api-stream') return;

  let abortController = new AbortController();
  let isPortConnected = true;
  let requestTimeoutId = null;

  port.onDisconnect.addListener(() => {
    isPortConnected = false;
    if (requestTimeoutId) clearTimeout(requestTimeoutId);
    // Keep running so a popup close does not interrupt the request or history save.
  });

  port.onMessage.addListener(async (msg) => {
    if (msg.action === 'abort') {
      abortController.abort();
      return;
    }
    if (msg.action !== 'callAPI') return;

    const { text, operationType, chatHistoryContext = [], targetLangValue } = msg;

    let isTimeoutAbort = false;

    try {
      if (!ALLOWED_OPERATION_TYPES.has(operationType)) {
        throw new Error('不支持的操作类型。');
      }
      if (operationType === 'chat' && !Array.isArray(chatHistoryContext)) {
        throw new Error('聊天上下文格式无效。');
      }
      if (operationType !== 'chat' && typeof text !== 'string') {
        throw new Error('请输入要处理的文本。');
      }

      const config = await chrome.storage.local.get([
        'apiKey', 'apiEndpoint', 'model', 'streamTranslate', 'streamChat'
      ]);
      const apiKey = config.apiKey || DEFAULT_API_KEY;
      const apiEndpoint = normalizeEndpoint(config.apiEndpoint || DEFAULT_API_ENDPOINT);
      const model = config.model || DEFAULT_MODEL;
      const streamTranslate = typeof config.streamTranslate === 'boolean' ? config.streamTranslate : true;
      const streamChat = typeof config.streamChat === 'boolean' ? config.streamChat : true;
      const endpointUrl = new URL(apiEndpoint);

      if (!apiKey && !isLocalEndpoint(endpointUrl)) {
        throw new Error('请先在 API 设置中配置 API 密钥。');
      }

      const isChat = operationType === 'chat';
      const shouldUseStream = isChat ? streamChat : streamTranslate;
      const systemPromptContent = buildSystemPrompt(operationType, targetLangValue);
      let messagesForAPI = [];

      if (isChat) {
        if (chatHistoryContext.length === 0 || chatHistoryContext[0].role !== 'system') {
          messagesForAPI.push({ role: 'system', content: systemPromptContent });
        }
        messagesForAPI = messagesForAPI.concat(chatHistoryContext);
      } else {
        messagesForAPI.push({ role: 'system', content: systemPromptContent });
        if (text.trim()) messagesForAPI.push({ role: 'user', content: text });
      }

      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      // Timeout: abort the request if it hangs for 90 seconds.
      // Covers network stalls where TCP stays alive but server never responds.
      requestTimeoutId = setTimeout(() => {
        isTimeoutAbort = true;
        abortController.abort();
      }, 90000);

      const response = await fetch(`${apiEndpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: messagesForAPI,
          temperature: 0.7,
          top_p: 1,
          max_tokens: 4096,
          stream: shouldUseStream
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        let errorResponseMessage = `API 返回状态 ${response.status} ${response.statusText || ''}`.trim();
        if (response.body) {
          try {
            const errorData = await response.json();
            errorResponseMessage = errorData.error?.message || errorData.message || JSON.stringify(errorData);
          } catch (e) {
            // Ignore malformed error bodies.
          }
        }
        throw new Error(`请求失败 (${response.status}): ${errorResponseMessage}`);
      }

      let rawReasoningAccumulator = '';
      let rawContentAccumulator = '';

      if (shouldUseStream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamBuffer += decoder.decode(value, { stream: true });

          let lineEndIndex;
          while ((lineEndIndex = streamBuffer.indexOf('\n')) !== -1) {
            const line = streamBuffer.substring(0, lineEndIndex).trim();
            streamBuffer = streamBuffer.substring(lineEndIndex + 1);

            if (!line.startsWith('data: ')) continue;
            const jsonData = line.substring('data: '.length).trim();
            if (jsonData.toUpperCase() === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonData);
              const contentChunk = parsed.choices[0]?.delta?.content || '';
              const reasoningChunk = parsed.choices[0]?.delta?.reasoning_content || '';

              if (reasoningChunk) rawReasoningAccumulator += reasoningChunk;
              if (contentChunk) {
                rawContentAccumulator += contentChunk;
                if (isPortConnected) {
                  port.postMessage({
                    type: 'chunk',
                    contentChunk,
                    reasoningChunk,
                    rawContentAccumulator,
                    rawReasoningAccumulator
                  });
                }
              }
            } catch (err) {
              console.error('Failed to parse streaming line:', err);
            }
          }
        }
      } else {
        const data = await response.json();
        rawContentAccumulator = data.choices[0]?.message?.content?.trim() || '';
        const reasoningContent = data.choices[0]?.message?.reasoning_content || '';
        if (reasoningContent) rawReasoningAccumulator = reasoningContent;
      }

      let finalResponse = rawContentAccumulator;
      if (isChat) {
        finalResponse = rawReasoningAccumulator
          ? `<think>${rawReasoningAccumulator}</think>` + rawContentAccumulator
          : rawContentAccumulator;
      }

      if (isChat) {
        let updatedHistory = [...chatHistoryContext];
        updatedHistory.push({ role: 'assistant', content: finalResponse });
        const systemPrompt = updatedHistory.find(m => m.role === 'system');
        let chatTurns = updatedHistory.filter(m => m.role !== 'system');
        if (chatTurns.length > MAX_CHAT_HISTORY_TURNS * 2) {
          chatTurns = chatTurns.slice(-MAX_CHAT_HISTORY_TURNS * 2);
        }
        updatedHistory = systemPrompt ? [systemPrompt, ...chatTurns] : chatTurns;
        await chrome.storage.local.set({ chatHistory: updatedHistory });
      } else {
        const dataHistory = await chrome.storage.local.get({ translationHistory: [] });
        const history = Array.isArray(dataHistory.translationHistory) ? dataHistory.translationHistory : [];
        const newEntry = {
          timestamp: new Date().toISOString(),
          original: text,
          result: finalResponse,
          type: operationType,
          lang: operationType === 'polish' || operationType === 'dictionary' ? 'auto' : targetLangValue
        };
        history.unshift(newEntry);
        await chrome.storage.local.set({ translationHistory: history.slice(0, MAX_HISTORY_ITEMS) });
      }

      if (isPortConnected) {
        port.postMessage({
          type: 'done',
          result: finalResponse
        });
      }
    } catch (error) {
      const errorMessage = isTimeoutAbort
        ? '请求超时（90秒），请检查网络或稍后重试。'
        : error.message;
      if (isPortConnected) {
        port.postMessage({ type: 'error', error: errorMessage });
      }
    } finally {
      if (requestTimeoutId) clearTimeout(requestTimeoutId);
    }
  });
});
