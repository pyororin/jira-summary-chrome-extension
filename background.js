chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_JIRA_SUMMARY') {
    const jiraKey = message.jiraKey;
    // Assuming the API endpoint is http://localhost:8080/hoge-be/summary
    // And it expects a POST request with JSON body: { "key": "YOUR_JIRA_KEY" }
    // And it returns JSON: { "summary": "YOUR_JIRA_SUMMARY" }

    fetch('http://localhost:8080/hoge-be/summary', { // Ensure this is the correct endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: jiraKey }),
    })
    .then(response => {
      if (!response.ok) {
        // Try to get error message from response body if possible
        return response.text().then(text => { // .text() or .json() depending on error response format
          throw new Error(`HTTP error ${response.status}: ${text || response.statusText}`);
        });
      }
      return response.json();
    })
    .then(data => {
      if (data && data.summary) {
        sendResponse({ summary: data.summary });
      } else {
        // Handle cases where data is not in expected format or summary is missing
        console.error('JIRA Summary Extension: Unexpected data structure from API:', data);
        sendResponse({ error: 'APIから予期しないデータ形式で応答がありました。' });
      }
    })
    .catch(error => {
      console.error('JIRA Summary Extension: Fetch error:', error);
      sendResponse({ error: error.message || '不明なエラーが発生しました。' });
    });

    return true; // Indicates that sendResponse will be called asynchronously
  }
});

// Optional: You can add installation/update listeners if needed, e.g., for context menus
// chrome.runtime.onInstalled.addListener(() => {
//   console.log('JIRA Summary Extension installed/updated.');
// });
