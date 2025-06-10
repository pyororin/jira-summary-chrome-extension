const ROOT_DISPLAY_CONTAINER_ID = 'jiraSummaryExtensionRootContainer';
const BUTTON_ID = 'jiraSummaryExtensionButton';

let messageAreaContainer = null;
let promptedAuthForJiraKey = null; // Added global variable

// --- Utility Functions (typeWriterEffect, getJiraKey) ---
function typeWriterEffect(text, element, delay = 10) {
  element.innerHTML = '';
  const lines = text.split('\n');
  let lineIndex = 0;
  let charIndex = 0;
  let currentLineStrongWrapper = null;

  function typeCharacter() {
    if (lineIndex >= lines.length) {
      return;
    }
    let currentLineText = lines[lineIndex];
    if (charIndex === 0) {
      if (lineIndex > 0) {
        element.appendChild(document.createElement('br'));
      }
      if (currentLineText.startsWith('- ')) {
        currentLineStrongWrapper = document.createElement('strong');
        element.appendChild(currentLineStrongWrapper);
      } else {
        currentLineStrongWrapper = null;
      }
    }
    if (charIndex < currentLineText.length) {
      const char = currentLineText.charAt(charIndex);
      const textNode = document.createTextNode(char);
      if (currentLineStrongWrapper) {
        currentLineStrongWrapper.appendChild(textNode);
      } else {
        element.appendChild(textNode);
      }
      charIndex++;
      setTimeout(typeCharacter, delay);
    } else {
      lineIndex++;
      charIndex = 0;
      currentLineStrongWrapper = null;
      setTimeout(typeCharacter, delay);
    }
  }
  typeCharacter();
}

function getJiraKey() {
  const keyValElement = document.getElementById('key-val');
  if (!keyValElement) {
    console.warn('JIRA Summary Extension: key-val element not found.');
    return null;
  }
  return keyValElement.textContent ? keyValElement.textContent.trim() : null;
}

// --- Button Creation & Management ---
function createAndInsertSummaryButton() {
  let button = document.getElementById(BUTTON_ID);
  if (!button) {
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.textContent = 'JIRAサマリー表示';
  }
  button.removeEventListener('click', handleSummaryButtonClick);
  button.addEventListener('click', handleSummaryButtonClick);
  const jiraShareTrigger = document.getElementById('jira-share-trigger');
  if (jiraShareTrigger && jiraShareTrigger.parentNode) {
    if (button.parentNode !== jiraShareTrigger.parentNode || button.nextSibling !== jiraShareTrigger) {
        jiraShareTrigger.parentNode.insertBefore(button, jiraShareTrigger);
    }
  } else {
    console.warn('JIRA Summary Extension: jira-share-trigger not found, button cannot be placed reliably.');
    if(button && button.parentNode) button.remove();
    return null;
  }
  return button;
}

// --- Display Area Preparation ---
function prepareMessageArea() {
    const rootDisplayContainer = document.getElementById(ROOT_DISPLAY_CONTAINER_ID);
    if (!rootDisplayContainer) {
        console.error("JIRA Summary Extension: Root display container not found. Cannot prepare message area.");
        messageAreaContainer = null;
        return false;
    }
    if (!messageAreaContainer || !rootDisplayContainer.contains(messageAreaContainer)) {
        rootDisplayContainer.innerHTML = '';
        messageAreaContainer = document.createElement('div');
        messageAreaContainer.id = 'jiraSummaryMessageArea';
        rootDisplayContainer.appendChild(messageAreaContainer);
    } else {
        messageAreaContainer.innerHTML = '';
    }
    return true;
}

// --- Display Functions ---
function displayLoading() {
  if (!prepareMessageArea()) return;
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'jiraSummaryLoading';
  loadingDiv.textContent = 'サマリーを作成しています...';
  messageAreaContainer.appendChild(loadingDiv);
}

function displaySummary(summaryText) {
  if (!prepareMessageArea()) return;
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'jiraSummaryDisplay';
  messageAreaContainer.appendChild(summaryDiv);
  typeWriterEffect(summaryText, summaryDiv);
}

function displayError(errorMessage) { // Can be used for info messages too
  if (!prepareMessageArea()) return;
  const errorDiv = document.createElement('div');
  errorDiv.id = 'jiraSummaryError'; // Consider a different ID for info messages if styling differs
  errorDiv.textContent = errorMessage;
  messageAreaContainer.appendChild(errorDiv);
}

function displayHtmlMessage(htmlContent, type = 'info') { // type could be 'error', 'info', 'auth' for styling
  if (!prepareMessageArea()) return;
  const messageDiv = document.createElement('div');
  messageDiv.id = `jiraSummaryMessage-${type}`; // e.g., jiraSummaryMessage-auth
  messageDiv.innerHTML = htmlContent; // Use innerHTML
  messageAreaContainer.appendChild(messageDiv);
}

// --- Event Handler for the button ---
function handleSummaryButtonClick() {
    if (!messageAreaContainer && !prepareMessageArea()) {
        console.error("JIRA Summary Extension: Message area container not initialized and could not be prepared.");
        alert("拡張機能の表示エリアが準備できていません。ページを再読み込みしてみてください。");
        return;
    }

    const jiraKey = getJiraKey();
    if (!jiraKey) {
      displayError('JIRAキーが見つかりません。');
      return;
    }

    displayLoading();

    const messagePayload = { type: 'GET_JIRA_SUMMARY', jiraKey: jiraKey };
    if (promptedAuthForJiraKey === jiraKey) {
        messagePayload.authRetry = true;
    }

    chrome.runtime.sendMessage(
      messagePayload,
      (response) => {
        // Initial check for message area availability.
        // If it's not available and not a situation where we are about to open a new tab (redirect/authUrl),
        // then it's problematic to proceed with displaying messages.
        if (!prepareMessageArea() && !(response && (response.redirectUrl || response.authUrl))) {
             console.error("JIRA Summary Extension: Message area became unavailable during API call and no redirect/auth URL to display.");
             if (!response || (!response.redirectUrl && !response.authUrl)) return;
        }

        if (chrome.runtime.lastError) {
          console.error('JIRA Summary Extension: Message sending failed:', chrome.runtime.lastError.message);
          displayError(`拡張機能エラー: ${chrome.runtime.lastError.message}`);
          promptedAuthForJiraKey = null; // Reset on runtime error
          return;
        }

        if (response) {
            // Handle authUrl first: if present, this is the primary info.
            if (response.authUrl && response.jiraKey) {
                const authMessage = `認証が必要です。 <a href='${response.authUrl}' target='_blank' rel='noopener noreferrer'>こちらをクリックしてログイン</a>し、その後再度「サマリー表示」ボタンを押してください。`;
                displayHtmlMessage(authMessage, 'auth');
                promptedAuthForJiraKey = response.jiraKey; // Set because auth is being prompted for this key
            } else {
                // Not an authUrl prompt, or jiraKey missing from authUrl response for some reason.
                // This means any previous auth prompt cycle for any key is now over.
                promptedAuthForJiraKey = null;

                // Now handle other response types.
                if (response.redirectUrl) {
                    chrome.tabs.create({ url: response.redirectUrl, active: true });
                    displayError('認証が必要です。新しいタブで認証を完了し、再度「サマリー表示」ボタンを押してください。');
                } else if (response.error) { // This will now also handle the authRetry 401 case
                    displayError(`エラー: ${response.error}`);
                } else if (typeof response.summary !== 'undefined') {
                    displaySummary(response.summary);
                } else {
                    // This case handles if response is not null, but doesn't match any known success/auth/error/redirect type.
                    // It could also be an authUrl response that was missing jiraKey, which is unexpected.
                    displayError('不明な応答がバックグラウンドから返されました。');
                }
            }
        } else {
          displayError('バックグラウンドスクリプトからの応答がありません。');
          promptedAuthForJiraKey = null; // Reset on no response
        }
      }
    );
}

// --- Main execution logic ---
const checkInterval = setInterval(() => {
  const jiraKeyValElement = document.getElementById('key-val');
  const jiraShareTriggerElement = document.getElementById('jira-share-trigger');
  const slackPanel = document.getElementById('slack-viewissue-panel');

  let displayInsertionPoint = null;
  if (slackPanel && slackPanel.children[1]) {
      displayInsertionPoint = slackPanel.children[1];
  }

  if (jiraKeyValElement && jiraShareTriggerElement && displayInsertionPoint) {
    clearInterval(checkInterval);

    let rootDisplayContainer = document.getElementById(ROOT_DISPLAY_CONTAINER_ID);
    if (!rootDisplayContainer) {
        rootDisplayContainer = document.createElement('div');
        rootDisplayContainer.id = ROOT_DISPLAY_CONTAINER_ID;
        displayInsertionPoint.insertAdjacentElement('afterend', rootDisplayContainer);
    }

    if (!prepareMessageArea()) {
        console.error("JIRA Summary Extension: Failed to prepare message area on initial setup. Aborting.");
        return;
    }

    createAndInsertSummaryButton();
  }
}, 500);
