document.addEventListener('DOMContentLoaded', () => {
  /* ==================== Constants ==================== */
  const MAX_HISTORY_ITEMS = 10;
  const MAX_CHAT_HISTORY_TURNS = 5;
  const DEFAULT_API_KEY = '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';
  const DEFAULT_API_ENDPOINT = 'https://integrate.api.nvidia.com/v1';
  const DEFAULT_MODEL = 'openai/gpt-oss-20b';

  /* ==================== DOM References ==================== */
  const tabNav = document.querySelector('.tab-nav');
  const apiKeyInput = document.getElementById('apiKey');
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const modelInput = document.getElementById('model');
  const streamTranslateCheckbox = document.getElementById('streamTranslate');
  const streamChatCheckbox = document.getElementById('streamChat');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');

  const translateInput = document.getElementById('input');
  const translateOutput = document.getElementById('output');
  const translateBtn = document.getElementById('translateBtn');
  const polishBtn = document.getElementById('polishBtn');
  const wordBtn = document.getElementById('wordBtn');
  const langSelect = document.getElementById('lang');
  const copyThinkBtn = document.getElementById('copyThinkBtn');
  const loadingIndicator = document.querySelector('#translate .loading-indicator');
  const clearOrStopBtn = document.getElementById('clearOrStopBtn');

  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const messageContainer = document.getElementById('messageContainer');
  const newChatBtn = document.getElementById('newChatBtn');

  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  /* ==================== State ==================== */
  let currentChatHistory = [];
  let isMainOperationInProgress = false;
  let currentMainOperationAbortController = null;
  let isChatSending = false;
  let currentChatAbortController = null;
  let isSettingsInitialized = false;
  let isChatInitialized = false;

  /* ==================== Utilities ==================== */
  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function brieflyChangeButtonState(button, tempText, duration = 1500) {
    if (!button) return;
    const originalText = button.textContent;
    const wasDisabled = button.disabled;
    button.textContent = tempText;
    if (button.id !== 'copyThinkBtn') {
      button.disabled = true;
    }
    setTimeout(() => {
      button.textContent = originalText;
      if (button.id !== 'copyThinkBtn') {
        button.disabled = wasDisabled;
      }
    }, duration);
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /* ==================== Config ==================== */
  async function ensureDefaultConfig() {
    const data = await chrome.storage.local.get([
      'apiKey', 'apiEndpoint', 'model', 'streamTranslate', 'streamChat'
    ]);
    const defaults = {};
    if (!data.apiKey) defaults.apiKey = DEFAULT_API_KEY;
    if (!data.apiEndpoint) defaults.apiEndpoint = DEFAULT_API_ENDPOINT;
    if (!data.model) defaults.model = DEFAULT_MODEL;
    if (typeof data.streamTranslate !== 'boolean') defaults.streamTranslate = true;
    if (typeof data.streamChat !== 'boolean') defaults.streamChat = true;
    if (Object.keys(defaults).length > 0) {
      await chrome.storage.local.set(defaults);
    }
  }

  async function saveAPIConfig() {
    const apiKey = apiKeyInput.value.trim();
    const apiEndpoint = apiEndpointInput.value.trim() || DEFAULT_API_ENDPOINT;
    const model = modelInput.value.trim() || DEFAULT_MODEL;
    try {
      const url = new URL(apiEndpoint);
      const origin = `${url.protocol}//${url.hostname}/*`;
      const hasPermission = await chrome.permissions.contains({ origins: [origin] });
      if (!hasPermission) {
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (!granted) {
          showToast('需要授予权限才能访问该端点', 'error');
          return;
        }
      }
      await chrome.storage.local.set({
        apiKey, apiEndpoint, model,
        streamTranslate: streamTranslateCheckbox.checked,
        streamChat: streamChatCheckbox.checked
      });
      brieflyChangeButtonState(saveApiKeyBtn, '已保存!');
    } catch (error) {
      showToast('保存失败: ' + error.message, 'error');
    }
  }

  async function initAPIConfig() {
    const data = await chrome.storage.local.get([
      'apiKey', 'apiEndpoint', 'model', 'streamTranslate', 'streamChat'
    ]);
    apiKeyInput.value = data.apiKey || DEFAULT_API_KEY;
    apiEndpointInput.value = data.apiEndpoint || DEFAULT_API_ENDPOINT;
    modelInput.value = data.model || DEFAULT_MODEL;
    streamTranslateCheckbox.checked = typeof data.streamTranslate === 'boolean' ? data.streamTranslate : true;
    streamChatCheckbox.checked = typeof data.streamChat === 'boolean' ? data.streamChat : true;
  }

  /* ==================== Translation ==================== */
  async function handleTextOperation(type) {
    const inputVal = translateInput.value.trim();
    const operationName = type === 'polish' ? '润色' : type === 'dictionary' ? '查询' : '翻译';
    if (!inputVal) {
      showToast(`请输入要${operationName}的内容`, 'error');
      return;
    }
    if (isMainOperationInProgress) {
      showToast('已有操作正在进行中，请稍候。', 'info');
      return;
    }

    isMainOperationInProgress = true;
    currentMainOperationAbortController = new AbortController();
    if (clearOrStopBtn) {
      clearOrStopBtn.textContent = '停止';
      clearOrStopBtn.classList.add('stop-btn');
    }
    if (translateBtn) translateBtn.disabled = true;
    if (polishBtn) polishBtn.disabled = true;
    if (wordBtn) wordBtn.disabled = true;
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    translateOutput.value = '';

    try {
      const result = await callAPI(inputVal, type, [], currentMainOperationAbortController.signal);
      if (typeof result === 'string') {
        translateOutput.value = result;
        addTranslationToHistory(inputVal, result, type);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        translateOutput.value = '操作已取消。';
      } else {
        showToast(`${operationName}失败: ${error.message}`, 'error');
        translateOutput.value = `错误: ${error.message}`;
      }
    } finally {
      isMainOperationInProgress = false;
      if (clearOrStopBtn) {
        clearOrStopBtn.textContent = '清空';
        clearOrStopBtn.classList.remove('stop-btn');
      }
      if (translateBtn) translateBtn.disabled = false;
      if (polishBtn) polishBtn.disabled = false;
      if (wordBtn) wordBtn.disabled = false;
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      currentMainOperationAbortController = null;
    }
  }

  /* ==================== History ==================== */
  async function addTranslationToHistory(original, result, type) {
    const data = await chrome.storage.local.get({ translationHistory: [] });
    let history = data.translationHistory;
    if (!Array.isArray(history)) history = [];
    const currentLang = langSelect ? langSelect.value : 'auto';
    const newEntry = {
      timestamp: new Date().toISOString(), original, result, type,
      lang: type === 'polish' || type === 'dictionary' ? 'auto' : currentLang
    };
    history.unshift(newEntry);
    const limitedHistory = history.slice(0, MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ translationHistory: limitedHistory });
    if (document.getElementById('history') && !document.getElementById('history').hidden) {
      updateHistoryList(limitedHistory);
    }
  }

  function updateHistoryList(history) {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (!history || history.length === 0) {
      const li = document.createElement('li');
      li.textContent = '暂无历史记录';
      li.className = 'history-empty-message';
      historyList.appendChild(li);
      return;
    }
    history.forEach(item => {
      const li = document.createElement('li');
      const resultString = typeof item.result === 'string' ? item.result : '';
      const originalString = typeof item.original === 'string' ? item.original : '';
      const typeString = typeof item.type === 'string' ? item.type : '未知';
      const cleanedResult = resultString.replace(/<think>[\s\S]*?<\/think>/ig, '').trim();
      const formattedResult = escapeHtml(cleanedResult).replace(/\n/g, '<br>');
      li.innerHTML = `
        <div class="history-item-meta">
          <span>[${escapeHtml(typeString)}]</span>
          <span class="history-item-time">${new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <div class="history-item-original">${escapeHtml(originalString)}</div>
        <div class="history-item-separator">➔</div>
        <div class="history-item-content">${formattedResult}</div>
      `;
      historyList.appendChild(li);
    });
  }

  async function initializeHistory() {
    const data = await chrome.storage.local.get({ translationHistory: [] });
    updateHistoryList(data.translationHistory || []);
  }

  async function clearHistory() {
    await chrome.storage.local.set({ translationHistory: [] });
    updateHistoryList([]);
    if (clearHistoryBtn) brieflyChangeButtonState(clearHistoryBtn, '已清除!');
  }

  /* ==================== Chat ==================== */
  function startNewChatSession() {
    currentChatHistory = [];
    if (messageContainer) messageContainer.innerHTML = '';
    addMessageToChat('assistant', '您好！我是您的AI助手，新的聊天会话已开始。', false);
    if (chatInput) chatInput.focus();
  }

  async function handleSendMessage() {
    const userInputText = chatInput.value.trim();
    if (!userInputText) return;

    addMessageToChat('user', userInputText, true);
    const chatHistoryForAPI = [...currentChatHistory];
    chatInput.value = '';
    chatInput.disabled = true;

    isChatSending = true;
    currentChatAbortController = new AbortController();
    sendBtn.textContent = '停止';

    try {
      await callAPI(null, 'chat', chatHistoryForAPI, currentChatAbortController.signal);
    } catch (error) {
      if (error.name === 'AbortError') {
        addMessageToChat('info', '(已停止生成)', false);
      } else {
        addMessageToChat('error', `请求失败: ${error.message}`, false);
      }
    } finally {
      isChatSending = false;
      currentChatAbortController = null;
      chatInput.disabled = false;
      sendBtn.textContent = '发送';
      chatInput.focus();
    }
  }

  function addMessageToChat(role, content, addToHistory = true) {
    if (!messageContainer) return null;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    let rawContent = (typeof content === 'string') ? content : '';
    let displayContent = rawContent.replace(/<think>[\s\S]*?<\/think>/ig, '').trim();
    contentDiv.innerHTML = escapeHtml(displayContent).replace(/\n/g, '<br>');
    messageDiv.appendChild(contentDiv);
    messageContainer.appendChild(messageDiv);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    if (addToHistory && (role === 'user' || role === 'assistant') && rawContent.trim() !== '') {
      let contentForHistory = rawContent.replace(/<think>[\s\S]*?<\/think>/ig, '').trim();
      if (contentForHistory || role === 'user') {
        currentChatHistory.push({ role, content: contentForHistory });
        const systemPrompt = currentChatHistory.find(m => m.role === 'system');
        let chatTurns = currentChatHistory.filter(m => m.role !== 'system');
        if (chatTurns.length > MAX_CHAT_HISTORY_TURNS * 2) {
          chatTurns = chatTurns.slice(-MAX_CHAT_HISTORY_TURNS * 2);
        }
        currentChatHistory = systemPrompt ? [systemPrompt, ...chatTurns] : chatTurns;
      }
    }
    return messageDiv;
  }

  /* ==================== API Call ==================== */
  async function callAPI(text, operationType, chatHistoryContext = [], signal = null) {
    const config = await chrome.storage.local.get([
      'apiKey', 'apiEndpoint', 'model', 'streamTranslate', 'streamChat'
    ]);
    const {
      apiKey,
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
4.  **【词根词缀分析】（如果适用）：** 请简要分析该单词的词根 (root)、前缀 (prefix)、后缀 (suffix) 及其含义，帮助理解词义构成。如果是短语或无法分析的简单词，可以注明"无明显词根词缀"或省略此项。
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
        const targetLangValue = langSelect ? langSelect.value : 'zh';
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
      signal: signal
    });

    if (!response.ok) {
      let errorResponseMessage = `API返回状态: ${response.status} ${response.statusText || '(没有状态文本)'}`;
      if (response.body) {
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorResponseMessage = errorData.error?.message || errorData.message || JSON.stringify(errorData);
          } else {
            const errorText = await response.text();
            errorResponseMessage = errorText || errorResponseMessage;
          }
        } catch (e) {
          console.error('处理API错误响应体时出错:', e);
        }
      }
      if (response.status === 403 && isLocalhost) {
        errorResponseMessage += ' (对于本地Ollama，请检查OLLAMA_ORIGINS环境变量是否正确配置以允许插件访问)';
      }
      throw new Error(`请求失败 (${response.status}): ${errorResponseMessage}`);
    }

    let rawAssistantResponse = '';

    /* ========== Streaming ========== */
    if (shouldUseStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rawReasoningAccumulator = '';
      let rawContentAccumulator = '';
      let tempAssistantUIDiv = null;

      if (isChat) {
        tempAssistantUIDiv = document.createElement('div');
        tempAssistantUIDiv.className = 'message assistant';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        tempAssistantUIDiv.appendChild(contentDiv);
        if (messageContainer) messageContainer.appendChild(tempAssistantUIDiv);
        if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight;
      } else {
        if (translateOutput) translateOutput.value = '';
      }

      try {
        while (true) {
          if (signal && signal.aborted) throw new DOMException('Aborted by user', 'AbortError');
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const eventLines = chunk.split('\n\n');
          for (const eventLine of eventLines) {
            if (eventLine.trim() === '') continue;
            const lines = eventLine.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonData = line.substring('data: '.length);
                if (jsonData.trim().toUpperCase() === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(jsonData);
                  const contentChunk = parsed.choices[0]?.delta?.content || '';
                  const reasoningChunk = parsed.choices[0]?.delta?.reasoning_content || '';

                  if (reasoningChunk) {
                    rawReasoningAccumulator += reasoningChunk;
                  }
                  if (contentChunk) {
                    rawContentAccumulator += contentChunk;
                    if (isChat && tempAssistantUIDiv) {
                      const displayText = rawContentAccumulator
                        .replace(/<think>[\s\S]*?<\/think>/ig, '')
                        .replace(/<think>[\s\S]*$/i, '')
                        .trim();
                      const contentNode = tempAssistantUIDiv.querySelector('.message-content');
                      if (contentNode) {
                        contentNode.innerHTML = escapeHtml(displayText).replace(/\n/g, '<br>');
                      }
                      if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight;
                    } else if (translateOutput) {
                      translateOutput.value += contentChunk;
                      translateOutput.scrollTop = translateOutput.scrollHeight;
                    }
                  }
                } catch (err) {
                  console.error('Failed to parse streaming chunk:', err);
                }
              }
            }
          }
        }
      } catch (streamError) {
        if (isChat && tempAssistantUIDiv) tempAssistantUIDiv.remove();
        throw streamError;
      }

      if (isChat) {
        rawAssistantResponse = '';
        if (rawReasoningAccumulator) {
          rawAssistantResponse += `<think>${rawReasoningAccumulator}</think>`;
        }
        rawAssistantResponse += rawContentAccumulator;
        if (tempAssistantUIDiv) tempAssistantUIDiv.remove();
        addMessageToChat('assistant', rawAssistantResponse, true);
        return rawAssistantResponse;
      }
      return rawContentAccumulator;

    /* ========== Non-streaming ========== */
    } else {
      const data = await response.json();
      const content = data.choices[0]?.message?.content?.trim() || '';
      if (isChat) {
        const reasoningContent = data.choices[0]?.message?.reasoning_content || '';
        rawAssistantResponse = reasoningContent
          ? `<think>${reasoningContent}</think>` + content
          : content;
        addMessageToChat('assistant', rawAssistantResponse, true);
        return rawAssistantResponse;
      }
      return content;
    }
  }

  /* ==================== Event Listeners ==================== */

  /* --- Tab Navigation --- */
  tabNav.addEventListener('click', (e) => {
    const button = e.target.closest('.tab-nav__btn');
    if (!button) return;
    const currentActiveTabButton = document.querySelector('.tab-nav__btn.is-active');
    const currentActiveTabId = currentActiveTabButton ? currentActiveTabButton.dataset.tab : null;
    const targetTabId = button.dataset.tab;

    if (currentActiveTabId === 'translate' && targetTabId !== 'translate'
        && isMainOperationInProgress && currentMainOperationAbortController) {
      currentMainOperationAbortController.abort();
    }
    if (currentActiveTabId === 'chat' && targetTabId !== 'chat'
        && isChatSending && currentChatAbortController) {
      currentChatAbortController.abort();
    }

    document.querySelectorAll('.tab-nav__btn').forEach(btn => {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.hidden = true;
    });
    button.classList.add('is-active');
    button.setAttribute('aria-selected', 'true');
    const targetPanel = document.getElementById(targetTabId);
    if (targetPanel) targetPanel.hidden = false;

    if (targetTabId === 'settings' && !isSettingsInitialized) {
      initAPIConfig();
      isSettingsInitialized = true;
    } else if (targetTabId === 'chat' && !isChatInitialized) {
      startNewChatSession();
      isChatInitialized = true;
    } else if (targetTabId === 'history') {
      initializeHistory();
    }
  });

  /* --- Settings --- */
  if (saveApiKeyBtn) saveApiKeyBtn.addEventListener('click', saveAPIConfig);

  /* --- Translate Buttons --- */
  if (translateBtn) translateBtn.addEventListener('click', () => {
    if (!isMainOperationInProgress) handleTextOperation('translate');
  });
  if (polishBtn) polishBtn.addEventListener('click', () => {
    if (!isMainOperationInProgress) handleTextOperation('polish');
  });
  if (wordBtn) wordBtn.addEventListener('click', () => {
    if (!isMainOperationInProgress) handleTextOperation('dictionary');
  });

  /* --- Clear / Stop --- */
  if (clearOrStopBtn) {
    clearOrStopBtn.addEventListener('click', () => {
      if (isMainOperationInProgress) {
        if (currentMainOperationAbortController) currentMainOperationAbortController.abort();
      } else {
        if (translateInput) translateInput.value = '';
        if (translateOutput) translateOutput.value = '';
        if (translateInput) translateInput.focus();
      }
    });
  }

  /* --- Copy Button --- */
  if (copyThinkBtn && translateOutput) {
    copyThinkBtn.addEventListener('click', () => {
      const outputText = translateOutput.value;
      if (!outputText.trim()) {
        showToast('没有可复制的内容', 'error');
        return;
      }
      const hasThinkBlock = /<think>[\s\S]*?<\/think>/i.test(outputText);
      let contentToCopy = outputText.replace(/<think>[\s\S]*?<\/think>/ig, '').trim();
      let buttonFeedbackText = '全文已复制!';

      if (hasThinkBlock) {
        if (contentToCopy) {
          buttonFeedbackText = '结论已复制!';
        } else {
          showToast('移除思考过程后无结论可复制', 'info');
          return;
        }
      }
      if (!contentToCopy) {
        showToast('没有可复制的内容', 'error');
        return;
      }
      navigator.clipboard.writeText(contentToCopy)
        .then(() => {
          brieflyChangeButtonState(copyThinkBtn, buttonFeedbackText);
        })
        .catch(err => {
          showToast('复制失败: ' + err.message, 'error');
        });
    });
  }

  /* --- Chat Send / Stop --- */
  if (sendBtn && chatInput) {
    sendBtn.addEventListener('click', () => {
      if (isChatSending) {
        if (currentChatAbortController) currentChatAbortController.abort();
      } else {
        handleSendMessage();
      }
    });
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isChatSending) handleSendMessage();
      }
    });
  }

  /* --- Chat New / History Clear --- */
  if (newChatBtn) newChatBtn.addEventListener('click', startNewChatSession);
  if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);

  /* ==================== Initialize ==================== */
  ensureDefaultConfig();
});