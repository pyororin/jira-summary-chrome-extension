// Ensure the DOM is sufficiently loaded, though content scripts often run at document_idle.
// We'll use a small delay or a specific element check if needed, but start directly for now.

function createSummaryButton() {
  const jiraShareTrigger = document.getElementById('jira-share-trigger');
  if (!jiraShareTrigger || !jiraShareTrigger.parentNode) {
    console.warn('JIRA Summary Extension: jira-share-trigger element not found or has no parent.');
    return null;
  }

  const button = document.createElement('button');
  button.textContent = 'JIRAサマリー表示';
  button.id = 'jiraSummaryExtensionButton'; // Add an ID for styling/identification
  button.style.marginLeft = '5px'; // Basic styling, can be moved to CSS
  button.style.marginRight = '5px';


  // Insert before jira-share-trigger
  jiraShareTrigger.parentNode.insertBefore(button, jiraShareTrigger);
  return button;
}

function getJiraKey() {
  const keyValElement = document.getElementById('key-val');
  if (!keyValElement) {
    console.warn('JIRA Summary Extension: key-val element not found.');
    return null;
  }
  // Assuming the key is in textContent, adjust if it's in an attribute like 'value' or 'data-key'
  return keyValElement.textContent ? keyValElement.textContent.trim() : null;
}

function getDisplayTargetElement() {
  const viewIssueSidebar = document.getElementById('viewissuesidebar');
  if (!viewIssueSidebar) {
    console.warn('JIRA Summary Extension: viewissuesidebar element not found.');
    return null;
  }
  // Find #slack-viewissue-panel then its second div child
  const slackPanel = viewIssueSidebar.querySelector('#slack-viewissue-panel');
  if (!slackPanel) {
    console.warn('JIRA Summary Extension: slack-viewissue-panel element not found.');
    return null;
  }
  const targetDiv = slackPanel.children[1]; // Assuming div[2] means the second child (index 1)
  if (!targetDiv) {
    console.warn('JIRA Summary Extension: Target div (second child of slack-viewissue-panel) not found.');
    return null;
  }
  return targetDiv;
}

function displayLoading(targetElement) {
  removeExistingMessages();
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'jiraSummaryLoading';
  loadingDiv.textContent = 'サマリーを作成しています...';
  loadingDiv.style.marginTop = '10px'; // Basic styling
  targetElement.insertAdjacentElement('afterend', loadingDiv);
  return loadingDiv;
}

function displaySummary(summaryText, targetElement) {
  removeExistingMessages(); // Remove loading or previous summary
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'jiraSummaryDisplay';
  summaryDiv.style.marginTop = '10px';
  summaryDiv.style.padding = '10px';
  summaryDiv.style.border = '1px solid #ccc';
  summaryDiv.style.whiteSpace = 'pre-wrap';
  summaryDiv.style.wordWrap = 'break-word';

  targetElement.insertAdjacentElement('afterend', summaryDiv);
  typeWriterEffect(summaryText, summaryDiv);
}

function displayError(errorMessage, targetElement) {
  removeExistingMessages();
  const errorDiv = document.createElement('div');
  errorDiv.id = 'jiraSummaryError';
  errorDiv.style.color = 'red';
  errorDiv.style.marginTop = '10px';
  errorDiv.textContent = errorMessage;
  targetElement.insertAdjacentElement('afterend', errorDiv);
}

function removeExistingMessages() {
  const loading = document.getElementById('jiraSummaryLoading');
  if (loading) loading.remove();
  const summary = document.getElementById('jiraSummaryDisplay');
  if (summary) summary.remove();
  const error = document.getElementById('jiraSummaryError');
  if (error) error.remove();
}

function typeWriterEffect(text, element, delay = 25) {
  let i = 0;
  element.textContent = ''; // Clear content before typing
  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, delay);
    }
  }
  type();
}

// Main execution
// We should ensure this runs after the target elements are available.
// A common practice is to use a MutationObserver if elements are dynamically loaded,
// or simply rely on `document_idle` run_at timing from manifest.
// For robustness, let's check for the trigger element before proceeding.

const checkInterval = setInterval(() => {
  if (document.getElementById('jira-share-trigger') && document.getElementById('key-val') && document.getElementById('viewissuesidebar')) {
    clearInterval(checkInterval); // Stop checking once elements are found

    const summaryButton = createSummaryButton();
    if (!summaryButton) return;

    summaryButton.addEventListener('click', () => {
      const jiraKey = getJiraKey();
      const displayTarget = getDisplayTargetElement();

      if (!jiraKey) {
        if(displayTarget) displayError('JIRAキーが見つかりません。', displayTarget);
        else alert('JIRAキーが見つかりません。');
        return;
      }
      if (!displayTarget) {
        alert('結果の表示場所が見つかりません。');
        return;
      }

      displayLoading(displayTarget);

      chrome.runtime.sendMessage(
        { type: 'GET_JIRA_SUMMARY', jiraKey: jiraKey },
        (response) => {
          removeExistingMessages(); // Ensure loading is removed even if target changed or error before display
          if (chrome.runtime.lastError) {
            // Handle errors from sendMessage itself (e.g., no listener)
            console.error('JIRA Summary Extension: Message sending failed:', chrome.runtime.lastError.message);
            displayError(`拡張機能エラー: ${chrome.runtime.lastError.message}`, displayTarget);
            return;
          }

          if (response) {
            if (response.error) {
              console.error('JIRA Summary Extension: Error from background:', response.error);
              displayError(`エラー: ${response.error}`, displayTarget);
            } else if (response.summary) {
              displaySummary(response.summary, displayTarget);
            } else {
              displayError('不明な応答がバックグラウンドから返されました。', displayTarget);
            }
          } else {
            displayError('バックグラウンドスクリプトからの応答がありません。', displayTarget);
          }
        }
      );
    });
  }
}, 500); // Check every 500ms
