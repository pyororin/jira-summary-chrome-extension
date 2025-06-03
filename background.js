chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_JIRA_SUMMARY') {
    const jiraKey = message.jiraKey;
    const maxRetries = 1;
    let attempt = 0;

    function doFetch(currentAttempt) {
      const apiUrl = `http://localhost:8080/jira/v1/summary/${encodeURIComponent(jiraKey)}`;

      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({ note: "全体の要約をお願いします。" })
      })
      .then(response => {
        if (!response.ok) {
          if (response.status === 503 && currentAttempt < maxRetries) {
            console.log(`JIRA Summary Extension: Received 503, attempt ${currentAttempt + 1} of ${maxRetries}. Retrying in 2 seconds...`);
            setTimeout(() => {
              doFetch(currentAttempt + 1);
            }, 2000);
            return null; // Signal to skip further .then() for this attempt
          }

          // For all other !response.ok cases (including 503 after max retries)
          return response.text().then(text => {
            // Log for 503 after retries, before throwing generic error
            if (response.status === 503) {
              console.warn('JIRA Summary Extension: Max retries reached for 503 (or was the only attempt and failed). Reporting generic error.');
            }
            const err = new Error(`HTTP error ${response.status}: ${text || response.statusText}`);
            throw err; // This rejects the promise chain, to be caught by .catch()
          });
        }
        return response.json();
      })
      .then(data => {
        if (data === null) { // A retry was triggered
          return;
        }

        if (data && typeof data.data !== 'undefined') {
          sendResponse({ summary: data.data });
        } else {
          console.error('JIRA Summary Extension: Unexpected data structure from API (expected data.data):', data);
          sendResponse({ error: 'APIから予期しないデータ形式（data.dataが見つかりません）で応答がありました。' });
        }
      })
      .catch(error => {
        // Simplified .catch block
        console.error('JIRA Summary Extension: Fetch error or other unhandled promise rejection:', error && error.message ? error.message : error);
        sendResponse({ error: (error && error.message) || '不明なエラーが発生しました。' });
      });
    }

    doFetch(attempt);

    return true;
  }
});
