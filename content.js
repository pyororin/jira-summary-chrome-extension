const ROOT_DISPLAY_CONTAINER_ID = 'jiraSummaryExtensionRootContainer'; // Renamed for clarity
const BUTTON_ID = 'jiraSummaryExtensionButton';
const THRESHOLD_STORAGE_KEY = 'jiraSummaryUserThresholds';
const THRESHOLD1_INPUT_ID = 'jiraSummaryThreshold1';
const THRESHOLD2_INPUT_ID = 'jiraSummaryThreshold2';
const THRESHOLD_CONTAINER_ID = 'jiraSummaryThresholdContainer';

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
        messageAreaContainer = null;
        return false;
    }

    // --- Create Threshold Inputs Area if not exists ---
    let thresholdContainer = document.getElementById(THRESHOLD_CONTAINER_ID);
    if (!thresholdContainer) {
        thresholdContainer = document.createElement('div');
        thresholdContainer.id = THRESHOLD_CONTAINER_ID;
        thresholdContainer.style.marginBottom = '10px'; // Add some spacing

        // Threshold 1
        const label1 = document.createElement('label');
        label1.setAttribute('for', THRESHOLD1_INPUT_ID);
        label1.textContent = 'Score Threshold 1: ';
        label1.style.marginRight = '5px';
        const input1 = document.createElement('input');
        input1.type = 'number';
        input1.id = THRESHOLD1_INPUT_ID;
        input1.placeholder = 'e.g., 0.5';
        input1.style.marginRight = '10px';
        input1.style.width = '80px';

        // Threshold 2
        const label2 = document.createElement('label');
        label2.setAttribute('for', THRESHOLD2_INPUT_ID);
        label2.textContent = 'Score Threshold 2: ';
        label2.style.marginRight = '5px';
        const input2 = document.createElement('input');
        input2.type = 'number';
        input2.id = THRESHOLD2_INPUT_ID;
        input2.placeholder = 'e.g., 0.8';
        input2.style.width = '80px';

        thresholdContainer.appendChild(label1);
        thresholdContainer.appendChild(input1);
        thresholdContainer.appendChild(document.createElement('br')); // New line for second threshold
        thresholdContainer.appendChild(label2);
        thresholdContainer.appendChild(input2);

        // Insert threshold container before message area or at the start of root container
        if (rootDisplayContainer.firstChild) {
            rootDisplayContainer.insertBefore(thresholdContainer, rootDisplayContainer.firstChild);
        } else {
            rootDisplayContainer.appendChild(thresholdContainer);
        }

        // --- Load thresholds after creating inputs ---
        const createdInput1 = thresholdContainer.querySelector('#' + THRESHOLD1_INPUT_ID);
        const createdInput2 = thresholdContainer.querySelector('#' + THRESHOLD2_INPUT_ID);

        chrome.storage.sync.get(THRESHOLD_STORAGE_KEY, (data) => {
            if (chrome.runtime.lastError) {
                console.error('JIRA Summary Extension: Error loading thresholds:', chrome.runtime.lastError.message);
                return;
            }
            const savedThresholds = data[THRESHOLD_STORAGE_KEY];
            if (savedThresholds) {
                if (savedThresholds.threshold1 !== undefined && createdInput1) {
                    createdInput1.value = savedThresholds.threshold1;
                }
                if (savedThresholds.threshold2 !== undefined && createdInput2) {
                    createdInput2.value = savedThresholds.threshold2;
                }
                console.log('JIRA Summary Extension: Thresholds loaded and applied to inputs.');
            }
        });
        // --- End of Load thresholds ---
    }
    // --- End of Threshold Inputs Area ---

    // If messageAreaContainer doesn't exist, isn't a child of root, or root was cleared (but not by us here).
    // We need to ensure it's placed *after* the threshold container.
    messageAreaContainer = document.getElementById('jiraSummaryMessageArea'); // Re-fetch in case it was there
    if (!messageAreaContainer || !rootDisplayContainer.contains(messageAreaContainer)) {
        if (messageAreaContainer) messageAreaContainer.remove(); // Remove if wrongly parented

        messageAreaContainer = document.createElement('div');
        messageAreaContainer.id = 'jiraSummaryMessageArea';
        rootDisplayContainer.appendChild(messageAreaContainer); // Add it to the end
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

// function displaySummary(summaryText) { // OLD
function displaySummary(summaryText, usedThresholds) { // NEW
  if (!prepareMessageArea()) return;
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'jiraSummaryDisplay';

  let fullText = summaryText;
  if (usedThresholds && (usedThresholds.threshold1 !== undefined || usedThresholds.threshold2 !== undefined)) {
    let thresholdDisplay = "\n--- Applied Thresholds ---\n"; // Using literal \n for typeWriterEffect which splits by \n

    if (usedThresholds.threshold1 !== undefined) {
      thresholdDisplay += `Threshold 1: ${usedThresholds.threshold1}\n`;
    }
    if (usedThresholds.threshold2 !== undefined) {
      thresholdDisplay += `Threshold 2: ${usedThresholds.threshold2}\n`;
    }
    fullText = thresholdDisplay + fullText; // Prepend to the main summary
  }

  messageAreaContainer.appendChild(summaryDiv);
  typeWriterEffect(fullText, summaryDiv); // Use the potentially modified fullText
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

    // --- Retrieve threshold values ---
    const threshold1Input = document.getElementById(THRESHOLD1_INPUT_ID);
    const threshold2Input = document.getElementById(THRESHOLD2_INPUT_ID);

    let threshold1Value = undefined;
    let threshold2Value = undefined;

    if (threshold1Input && threshold1Input.value !== '') {
        const parsedValue = parseFloat(threshold1Input.value);
        if (!isNaN(parsedValue)) {
            threshold1Value = parsedValue;
        } else {
            // Optionally, display an error or ignore invalid input
            console.warn('JIRA Summary Extension: Invalid input for Threshold 1. Sending without it.');
        }
    }

    if (threshold2Input && threshold2Input.value !== '') {
        const parsedValue = parseFloat(threshold2Input.value);
        if (!isNaN(parsedValue)) {
            threshold2Value = parsedValue;
        } else {
            // Optionally, display an error or ignore invalid input
            console.warn('JIRA Summary Extension: Invalid input for Threshold 2. Sending without it.');
        }
    }
    // --- End of Retrieve threshold values ---

    // --- Save defined thresholds to storage ---
    const userThresholds = {};
    const t1Input = document.getElementById(THRESHOLD1_INPUT_ID);
    const t2Input = document.getElementById(THRESHOLD2_INPUT_ID);

    if (t1Input && t1Input.value !== '') userThresholds.threshold1 = t1Input.value;
    if (t2Input && t2Input.value !== '') userThresholds.threshold2 = t2Input.value;

    chrome.storage.sync.set({ [THRESHOLD_STORAGE_KEY]: userThresholds }, () => {
        if (chrome.runtime.lastError) {
            console.error('JIRA Summary Extension: Error saving thresholds:', chrome.runtime.lastError.message);
        } else {
            console.log('JIRA Summary Extension: Thresholds saved.');
        }
    });
    // --- End of Save thresholds to storage ---

    displayLoading();

    // Construct message payload, including thresholds if they have values
    const messagePayload = {
        type: 'GET_JIRA_SUMMARY',
        jiraKey: jiraKey
    };
    if (threshold1Value !== undefined) {
        messagePayload.threshold1 = threshold1Value;
    }
    if (threshold2Value !== undefined) {
        messagePayload.threshold2 = threshold2Value;
    }

    chrome.runtime.sendMessage(
      messagePayload, // Updated message payload
      (response) => {
        // ... rest of the callback remains the same
        if (!prepareMessageArea() && !response ) {
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
            // Pass response.summary and response.usedThresholds to displaySummary
            displaySummary(response.summary, response.usedThresholds);
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
