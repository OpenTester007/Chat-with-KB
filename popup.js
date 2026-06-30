document.addEventListener('DOMContentLoaded', () => {
  const MAX_CHAT_HISTORY_TURNS = 5;
  const DEFAULT_API_KEY = '';
  const DEFAULT_API_ENDPOINT = 'https://integrate.api.nvidia.com/v1';
  const DEFAULT_MODEL = 'openai/gpt-oss-20b';

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

  let currentChatHistory = [];
  let isMainOperationInProgress = false;
  let currentMainOperationAbortController = null;
  let isChatSending = false;
  let currentChatAbortController = null;
  let isSettingsInitialized = false;
  let isChatInitialized = false;

  function stripThinkBlock(text) {
    return String(text || '').replace(/<think>[\s\S]*?<\/think>/ig, '').trim();
  }

  function setTextWithLineBreaks(element, text) {
    element.textContent = '';
    String(text || '').split('\n').forEach((line, index) => {
      if (index > 0) element.appendChild(document.createElement('br'));
      element.appendChild(document.createTextNode(line));
    });
  }

  function brieflyChangeButtonState(button, tempText, duration = 1500) {
    if (!button) return;
    const originalText = button.textContent;
    const wasDisabled = button.disabled;
    button.textContent = tempText;
    if (button.id !== 'copyThinkBtn') button.disabled = true;
    setTimeout(() => {
      button.textContent = originalText;
      if (button.id !== 'copyThinkBtn') button.disabled = wasDisabled;
    }, duration);
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

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

  function getPermissionPattern(endpoint) {
    const url = new URL(endpoint);
    if (isLocalEndpoint(url)) {
      return `${url.protocol}//${url.hostname}/*`;
    }
    return `${url.protocol}//${url.hostname}/*`;
  }

  async function ensureDefaultConfig() {
    const data = await chrome.storage.local.get([
      'apiEndpoint', 'model', 'streamTranslate', 'streamChat'
    ]);
    const defaults = {};
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
    const model = modelInput.value.trim() || DEFAULT_MODEL;

    try {
      const apiEndpoint = normalizeEndpoint(apiEndpointInput.value.trim());
      const origin = getPermissionPattern(apiEndpoint);
      const hasPermission = await chrome.permissions.contains({ origins: [origin] });
      if (!hasPermission) {
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (!granted) {
          showToast('需要授权后才能访问该 API 端点。', 'error');
          return;
        }
      }

      await chrome.storage.local.set({
        apiKey,
        apiEndpoint,
        model,
        streamTranslate: streamTranslateCheckbox.checked,
        streamChat: streamChatCheckbox.checked
      });
      brieflyChangeButtonState(saveApiKeyBtn, '已保存');
    } catch (error) {
      showToast('保存失败：' + error.message, 'error');
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
        if (document.getElementById('history') && !document.getElementById('history').hidden) {
          await initializeHistory();
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        translateOutput.value = '操作已取消。';
      } else {
        showToast(`${operationName}失败：${error.message}`, 'error');
        translateOutput.value = `错误：${error.message}`;
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

  function appendTextBlock(parent, className, text) {
    const div = document.createElement('div');
    div.className = className;
    setTextWithLineBreaks(div, text);
    parent.appendChild(div);
  }

  function updateHistoryList(history) {
    if (!historyList) return;
    historyList.textContent = '';
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
      const cleanedResult = stripThinkBlock(resultString);

      const meta = document.createElement('div');
      meta.className = 'history-item-meta';

      const typeSpan = document.createElement('span');
      typeSpan.textContent = `[${typeString}]`;
      meta.appendChild(typeSpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'history-item-time';
      timeSpan.textContent = new Date(item.timestamp).toLocaleString();
      meta.appendChild(timeSpan);

      li.appendChild(meta);
      appendTextBlock(li, 'history-item-original', originalString);
      appendTextBlock(li, 'history-item-separator', '→');
      appendTextBlock(li, 'history-item-content', cleanedResult);
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
    if (clearHistoryBtn) brieflyChangeButtonState(clearHistoryBtn, '已清除');
  }

  async function startNewChatSession() {
    currentChatHistory = [];
    await chrome.storage.local.set({ chatHistory: [] });
    if (messageContainer) messageContainer.textContent = '';
    addMessageToChat('assistant', '您好，我是您的 AI 助手，新的聊天会话已开始。', false);
    if (chatInput) chatInput.focus();
  }

  async function loadChatHistory() {
    const data = await chrome.storage.local.get({ chatHistory: [] });
    currentChatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    if (!messageContainer) return;

    messageContainer.textContent = '';
    if (currentChatHistory.length === 0) {
      addMessageToChat('assistant', '您好，我是您的 AI 助手，新的聊天会话已开始。', false);
      return;
    }

    currentChatHistory.forEach(msg => {
      addMessageToChat(msg.role, msg.content, false);
    });
  }

  async function initializeChatSession() {
    await loadChatHistory();
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
        addMessageToChat('error', `请求失败：${error.message}`, false);
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
    const rawContent = typeof content === 'string' ? content : '';
    const displayContent = stripThinkBlock(rawContent);
    setTextWithLineBreaks(contentDiv, displayContent);

    messageDiv.appendChild(contentDiv);
    messageContainer.appendChild(messageDiv);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    if (addToHistory && (role === 'user' || role === 'assistant') && rawContent.trim() !== '') {
      const contentForHistory = stripThinkBlock(rawContent);
      if (contentForHistory || role === 'user') {
        currentChatHistory.push({ role, content: contentForHistory });
        const systemPrompt = currentChatHistory.find(m => m.role === 'system');
        let chatTurns = currentChatHistory.filter(m => m.role !== 'system');
        if (chatTurns.length > MAX_CHAT_HISTORY_TURNS * 2) {
          chatTurns = chatTurns.slice(-MAX_CHAT_HISTORY_TURNS * 2);
        }
        currentChatHistory = systemPrompt ? [systemPrompt, ...chatTurns] : chatTurns;
        chrome.storage.local.set({ chatHistory: currentChatHistory });
      }
    }

    return messageDiv;
  }

  async function callAPI(text, operationType, chatHistoryContext = [], signal = null) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'api-stream' });
      let settled = false;

      function finish(callback, value) {
        if (settled) return;
        settled = true;
        try {
          port.disconnect();
        } catch (e) {
          // The port may already be closed by the service worker.
        }
        callback(value);
      }

      if (signal) {
        signal.addEventListener('abort', () => {
          port.postMessage({ action: 'abort' });
          finish(reject, new DOMException('Aborted by user', 'AbortError'));
        }, { once: true });
      }

      // Handle unexpected port disconnect (e.g. service worker crash).
      // Without this, the promise would hang forever and loading never clears.
      port.onDisconnect.addListener(() => {
        if (settled) return;
        finish(reject, new Error('后台连接已断开，请重试。'));
      });

      const isChat = operationType === 'chat';
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
      } else if (translateOutput) {
        translateOutput.value = '';
      }

      port.postMessage({
        action: 'callAPI',
        text,
        operationType,
        chatHistoryContext,
        targetLangValue: langSelect ? langSelect.value : 'zh'
      });

      port.onMessage.addListener((msg) => {
        if (msg.type === 'chunk') {
          const { contentChunk } = msg;
          if (!contentChunk) return;

          rawContentAccumulator += contentChunk;
          if (isChat && tempAssistantUIDiv) {
            const displayText = rawContentAccumulator
              .replace(/<think>[\s\S]*?<\/think>/ig, '')
              .replace(/<think>[\s\S]*$/i, '')
              .trim();
            const contentNode = tempAssistantUIDiv.querySelector('.message-content');
            if (contentNode) setTextWithLineBreaks(contentNode, displayText);
            if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight;
          } else if (translateOutput) {
            translateOutput.value += contentChunk;
            translateOutput.scrollTop = translateOutput.scrollHeight;
          }
        } else if (msg.type === 'done') {
          if (isChat) {
            if (tempAssistantUIDiv) tempAssistantUIDiv.remove();
            addMessageToChat('assistant', msg.result, true);
          }
          finish(resolve, msg.result);
        } else if (msg.type === 'error') {
          if (isChat && tempAssistantUIDiv) tempAssistantUIDiv.remove();
          finish(reject, new Error(msg.error));
        }
      });
    });
  }

  if (tabNav) {
    tabNav.addEventListener('click', (e) => {
      const button = e.target.closest('.tab-nav__btn');
      if (!button) return;
      const currentActiveTabButton = document.querySelector('.tab-nav__btn.is-active');
      const currentActiveTabId = currentActiveTabButton ? currentActiveTabButton.dataset.tab : null;
      const targetTabId = button.dataset.tab;



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
        initializeChatSession();
        isChatInitialized = true;
      } else if (targetTabId === 'history') {
        initializeHistory();
      }
    });
  }

  if (saveApiKeyBtn) saveApiKeyBtn.addEventListener('click', saveAPIConfig);
  if (translateBtn) translateBtn.addEventListener('click', () => {
    if (!isMainOperationInProgress) handleTextOperation('translate');
  });
  if (polishBtn) polishBtn.addEventListener('click', () => {
    if (!isMainOperationInProgress) handleTextOperation('polish');
  });
  if (wordBtn) wordBtn.addEventListener('click', () => {
    if (!isMainOperationInProgress) handleTextOperation('dictionary');
  });

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

  if (copyThinkBtn && translateOutput) {
    copyThinkBtn.addEventListener('click', () => {
      const outputText = translateOutput.value;
      if (!outputText.trim()) {
        showToast('没有可复制的内容', 'error');
        return;
      }

      const hasThinkBlock = /<think>[\s\S]*?<\/think>/i.test(outputText);
      const contentToCopy = stripThinkBlock(outputText);
      if (!contentToCopy) {
        showToast('没有可复制的内容', 'error');
        return;
      }

      navigator.clipboard.writeText(contentToCopy)
        .then(() => brieflyChangeButtonState(copyThinkBtn, hasThinkBlock ? '结果已复制' : '全文已复制'))
        .catch(err => showToast('复制失败：' + err.message, 'error'));
    });
  }

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

  if (newChatBtn) newChatBtn.addEventListener('click', startNewChatSession);
  if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);

  const versionInfo = document.getElementById('versionInfo');
  if (versionInfo) versionInfo.textContent = `AI-based Translator v${chrome.runtime.getManifest().version}`;

  ensureDefaultConfig();
});
