const DEFAULT_API_KEY = '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';
const DEFAULT_API_ENDPOINT = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

const MAX_HISTORY_ITEMS = 10;
const MAX_CHAT_HISTORY_TURNS = 5;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'api-stream') {
    let abortController = new AbortController();
    let isPortConnected = true;

    port.onDisconnect.addListener(() => {
      isPortConnected = false;
      // We purposefully DO NOT abort here so the translation can finish in the background
      // and get saved to the history when completed.
    });

    port.onMessage.addListener(async (msg) => {
      if (msg.action === 'callAPI') {
        const { text, operationType, chatHistoryContext, targetLangValue } = msg;
        try {
          const config = await chrome.storage.local.get([
            'apiKey', 'apiEndpoint', 'model', 'streamTranslate', 'streamChat'
          ]);
          const {
            apiKey = DEFAULT_API_KEY,
            apiEndpoint = DEFAULT_API_ENDPOINT,
            model = DEFAULT_MODEL,
            streamTranslate = true,
            streamChat = true
          } = config;

          const isLocalhost = apiEndpoint && (
            apiEndpoint.includes('localhost') || apiEndpoint.includes('127.0.0.1')
          );
          if (!apiKey && !isLocalhost) {
            throw new Error('请先在API设置中配置API密钥');
          }

          const isChat = operationType === 'chat';
          const shouldUseStream = isChat ? streamChat : streamTranslate;
          let messagesForAPI = [];
          let systemPromptContent = '';

          if (isChat) {
            systemPromptContent = '你是一位AI助手，请用与用户相同的语言简洁回复。';
            if (chatHistoryContext.length === 0 || chatHistoryContext[0].role !== 'system') {
              messagesForAPI.push({ role: 'system', content: systemPromptContent });
            }
            messagesForAPI = messagesForAPI.concat(chatHistoryContext);
          } else {
            if (operationType === 'polish') {
              systemPromptContent = `
你是一位专业的双语编辑，擅长文本润色。
当用户提供一段文本时：
首先，你必须识别出文本的原始语言。
然后，使用【与原始文本完全相同的语言】进行润色，使其更流畅、准确，并保持原意。
最后，请你【用中文】向用户解释你做了哪些关键的修改以及为什么这么修改。
例如，如果用户输入英文："He go to school yesterday."
你的输出应该是：
He went to school yesterday.
(中文解释：将动词 "go" 改为过去式 "went" 以匹配时间状语 "yesterday"。)
请直接开始处理用户接下来的输入。`;
            } else if (operationType === 'dictionary') {
              systemPromptContent = `
你是一个博学的中英双语词典机器人，并且擅长词源分析。
对于用户输入的单词或短语：
1.  请给出其最核心的【中文释义】。
2.  请给出其最核心的【英文释义】。
3.  如果适用，请指出其主要【词性】。
4.  **【词根词缀分析】（如果适用）：** 请简要分析该单词的词根 (root)，前缀 (prefix)，后缀 (suffix) 及其含义，帮助理解词义构成。如果是短语或无法分析的简单词，可以注明"无明显词根词缀"或省略此项。
5.  提供1-2个包含该词或短语的【中英双语对照例句】或【英文例句附中文翻译】。
请确保输出清晰、准确、易懂。
例如，输入 "unbelievable":
正确写法：Unbelievable
词性：adj.
中文释义：难以置信的，不可相信的
英文释义：Difficult to believe; extraordinary.
词根词缀分析：
  - un- (前缀)：表示"不，非"
  - believe (词根)：相信，信任
  - -able (后缀)：表示"能够...的，值得...的"
例句：
  - His story about seeing a UFO was completely unbelievable. (他说的看见UFO的故事完全令人难以置信。)
又例如，输入 "apple":
正确写法：Apple
词性：n.
中文释义：苹果
英文释义：A round fruit with firm, white flesh and a green or red skin.
词根词缀分析：无明显词根词缀
例句：
  - An apple a day keeps the doctor away. (一天一苹果，医生远离我。)
请直接开始处理用户接下来的输入。`;
            } else {
              const langMap = { 'zh': '中文', 'en': '英文', 'ja': '日文', 'ko': '韩文' };
              systemPromptContent = `你是一位专业的翻译引擎。请自动检测用户输入文本的源语言，然后将其准确地翻译成【${langMap[targetLangValue] || '中文'}】。请直接输出翻译结果，不要包含任何额外说明或源语言的识别信息。`;
            }
            messagesForAPI.push({ role: 'system', content: systemPromptContent });
            if (text) messagesForAPI.push({ role: 'user', content: text });
          }

          const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

          const response = await fetch(`${apiEndpoint}/chat/completions`, {
            method: 'POST',
            headers: headers,
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
            let errorResponseMessage = `API返回状态: ${response.status} ${response.statusText || '(没有状态文本)'}`;
            if (response.body) {
              try {
                const errorData = await response.json();
                errorResponseMessage = errorData.error?.message || errorData.message || JSON.stringify(errorData);
              } catch (e) {
                // ignore
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

                if (line.startsWith('data: ')) {
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
            }
          } else {
            const data = await response.json();
            rawContentAccumulator = data.choices[0]?.message?.content?.trim() || '';
            const reasoningContent = data.choices[0]?.message?.reasoning_content || '';
            if (reasoningContent) {
              rawReasoningAccumulator = reasoningContent;
            }
          }

          // Complete response construction
          let finalResponse = rawContentAccumulator;
          if (isChat) {
            finalResponse = rawReasoningAccumulator
              ? `<think>${rawReasoningAccumulator}</think>` + rawContentAccumulator
              : rawContentAccumulator;
          }

          // Save to history / storage
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
            let history = dataHistory.translationHistory || [];
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
          if (isPortConnected) {
            port.postMessage({ type: 'error', error: error.message });
          }
        }
      } else if (msg.action === 'abort') {
        abortController.abort();
      }
    });
  }
});
