const ROOT_DISPLAY_CONTAINER_ID = 'jiraSummaryExtensionRootContainer'; // Renamed for clarity
const BUTTON_ID = 'jiraSummaryExtensionButton';

let messageAreaContainer = null; // Will hold the div inside ROOT_DISPLAY_CONTAINER_ID

// --- Utility Functions (typeWriterEffect, getJiraKey) ---
function typeWriterEffect(text, element, delay = 10) { // delay is already 10ms from previous change
  element.innerHTML = ''; // Clear content before typing
  const lines = text.split('\n'); // Split text into lines based on literal \n (corrected from prompt to use literal \n for now)
  let lineIndex = 0;
  let charIndex = 0;
  let currentLineStrongWrapper = null; // To hold the <strong> element for the current heading line

  function typeCharacter() {
    if (lineIndex >= lines.length) {
      return; // All lines processed
    }

    let currentLineText = lines[lineIndex];

    if (charIndex === 0) { // Processing the start of a new line
      if (lineIndex > 0) { // Add <br> before starting a new line, if it's not the very first line
        element.appendChild(document.createElement('br'));
      }
      // Check if the current line is a heading
      if (currentLineText.startsWith('- ')) {
        currentLineStrongWrapper = document.createElement('strong');
        element.appendChild(currentLineStrongWrapper);
      } else {
        currentLineStrongWrapper = null; // Not a heading line, subsequent characters append directly to `element`
      }
    }

    // Type the next character of the current line
    if (charIndex < currentLineText.length) {
      const char = currentLineText.charAt(charIndex);
      const textNode = document.createTextNode(char);

      if (currentLineStrongWrapper) {
        // If it's a heading line, append character to the <strong> wrapper
        currentLineStrongWrapper.appendChild(textNode);
      } else {
        // Otherwise, append character directly to the main display element
        element.appendChild(textNode);
      }

      charIndex++;
      setTimeout(typeCharacter, delay);
    } else { // Reached the end of the current line
      lineIndex++; // Move to the next line
      charIndex = 0; // Reset character index for the new line
      currentLineStrongWrapper = null; // Reset strong wrapper for the new line

      setTimeout(typeCharacter, delay);
    }
  }
  typeCharacter(); // Start the typing process
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
    // Attempt to remove button if it exists but cannot be placed, to avoid orphaned interactive elements
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
        messageAreaContainer = null; // Ensure it's null if root is gone
        return false;
    }

    // If messageAreaContainer doesn't exist, isn't a child of root, or root was cleared.
    if (!messageAreaContainer || !rootDisplayContainer.contains(messageAreaContainer)) {
        rootDisplayContainer.innerHTML = ''; // Clear root container for fresh setup
        messageAreaContainer = document.createElement('div');
        messageAreaContainer.id = 'jiraSummaryMessageArea'; // For potential specific styling
        rootDisplayContainer.appendChild(messageAreaContainer);
    } else {
        // If it exists and is correctly parented, just clear its content for new messages
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

function displayError(errorMessage) {
  if (!prepareMessageArea()) return;
  const errorDiv = document.createElement('div');
  errorDiv.id = 'jiraSummaryError';
  errorDiv.textContent = errorMessage;
  messageAreaContainer.appendChild(errorDiv);
}

// --- Event Handler for the button ---
function handleSummaryButtonClick() {
    if (!messageAreaContainer && !prepareMessageArea()) { // Try to prepare if not ready
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

    chrome.runtime.sendMessage(
      { type: 'GET_JIRA_SUMMARY', jiraKey: jiraKey },
      (response) => {
        if (!prepareMessageArea() && !response ) { // Ensure message area is still valid before displaying response
             console.error("JIRA Summary Extension: Message area became unavailable during API call.");
             return;
        }
        if (chrome.runtime.lastError) {
          console.error('JIRA Summary Extension: Message sending failed:', chrome.runtime.lastError.message);
          displayError(`拡張機能エラー: ${chrome.runtime.lastError.message}`);
          return;
        }
        if (response) {
          if (response.error) {
            displayError(`エラー: ${response.error}`);
          } else if (typeof response.summary !== 'undefined') {
            displaySummary(response.summary);
          } else {
            displayError('不明な応答がバックグラウンドから返されました。');
          }
        } else {
          displayError('バックグラウンドスクリプトからの応答がありません。');
        }
      }
    );
}

// --- Main execution logic ---
const checkInterval = setInterval(() => {
  const jiraKeyValElement = document.getElementById('key-val');
  const jiraShareTriggerElement = document.getElementById('jira-share-trigger'); // Needed for button placement
  const slackPanel = document.getElementById('slack-viewissue-panel'); // Needed for display area placement

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
