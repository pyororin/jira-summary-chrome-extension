chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_JIRA_SUMMARY') {
    const jiraKey = message.jiraKey;
    const maxRetries = 1; // For 503 errors
    let attempt = 0; // For 503 errors

    function doFetch(currentAttempt, retriedAfterHogeTop = false) { // Added retriedAfterHogeTop
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
        if (response.status === 401) {
          if (!retriedAfterHogeTop) {
            console.log('JIRA Summary Extension: Received 401. Attempting /hoge/top and retry.');
            // Make the /hoge/top request
            fetch('http://localhost:8080/hoge/top', { method: 'GET', credentials: 'omit' })
              .finally(() => { // Ensure original request is retried regardless of /hoge/top outcome
                console.log('JIRA Summary Extension: /hoge/top request completed. Retrying original API call.');
                doFetch(currentAttempt, true); // Pass true for retriedAfterHogeTop
              });
            return null; // Signal to skip further .then() for this attempt
          } else {
            // If 401 received even after /hoge/top and retry, treat as a final error
            console.warn('JIRA Summary Extension: Received 401 again after /hoge/top and retry.');
            // Fall through to the generic error handling for !response.ok
          }
        }

        if (!response.ok) {
          if (response.status === 503 && currentAttempt < maxRetries) {
            console.log(`JIRA Summary Extension: Received 503, attempt ${currentAttempt + 1} of ${maxRetries}. Retrying in 2 seconds...`);
            setTimeout(() => {
              // Note: currentAttempt for 503 is separate from retriedAfterHogeTop for 401
              doFetch(currentAttempt + 1, retriedAfterHogeTop);
            }, 2000);
            return null; // Signal to skip further .then() for this attempt
          }

          return response.text().then(text => {
            if (response.status === 503) {
              console.warn('JIRA Summary Extension: Max retries reached for 503. Reporting error.');
            }
            // For 401 after retry, or any other non-ok status
            const err = new Error(`HTTP error ${response.status}: ${text || response.statusText}`);
            throw err;
          });
        }
        return response.json();
      })
      .then(data => {
        if (data === null) { // A retry (either 503 or initial 401 flow) was triggered
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

    doFetch(attempt); // Initial call, retriedAfterHogeTop is false by default

    return true;
  }
});
