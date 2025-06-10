chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_JIRA_SUMMARY') {
    const jiraKey = message.jiraKey;
    const maxRetries = 1; // For 503 errors
    let attempt = 0; // For 503 errors

    function doFetch(currentAttempt, retriedAfterHogeTop = false) {
      const apiUrl = 'http://localhost:8080/hoge/api/jira-summary/';

      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({ jiraKey: jiraKey, note: "全体の要約をお願いします。" }),
        redirect: 'manual' // Key change: handle redirects manually
      })
      .then(response => {
        // Handle actual redirects first when redirect: 'manual' is used
        if (response.status >= 300 && response.status < 400 && response.headers.has('Location')) {
            const location = response.headers.get('Location');
            console.log(`JIRA Summary Extension: Detected redirect status ${response.status} to ${location}`);
            sendResponse({ redirectUrl: location });
            return null; // Stop further processing in this chain, response handled
        }

        // Existing 401 handling
        if (response.status === 401) {
            if (!retriedAfterHogeTop) {
                console.log('JIRA Summary Extension: Received 401. Attempting /hoge/top and retry.');
                fetch('http://localhost:8080/hoge/top', { method: 'GET', credentials: 'omit' })
                  .finally(() => {
                    console.log('JIRA Summary Extension: /hoge/top request completed. Retrying original API call.');
                    doFetch(currentAttempt, true); // Pass true for retriedAfterHogeTop
                  });
                return null; // Stop this chain, new fetch initiated
            } else {
                console.warn('JIRA Summary Extension: Received 401 again after /hoge/top and retry.');
                // Fall through to !response.ok for error reporting via that path
            }
        }

        // Existing non-ok (including 503 retry) and error handling
        if (!response.ok) { // This will catch 401s that fall through, and other client/server errors
            if (response.status === 503 && currentAttempt < maxRetries) {
                console.log(`JIRA Summary Extension: Received 503, attempt ${currentAttempt + 1} of ${maxRetries}. Retrying in 2 seconds...`);
                setTimeout(() => {
                    doFetch(currentAttempt + 1, retriedAfterHogeTop);
                }, 2000);
                return null; // Stop this chain, new fetch will be initiated by setTimeout
            }

            // For other errors (including 401 after retry, or 503 max retries)
            return response.text().then(text => {
                const errorMessage = text || response.statusText || `HTTP error ${response.status}`;
                const err = new Error(errorMessage);
                console.warn(`JIRA Summary Extension: Reporting error for status ${response.status}. Details: ${errorMessage}`);
                throw err; // This will be caught by the .catch block
            });
        }

        // If we reach here, it's a successful (2xx) response
        return response.json();
      })
      .then(data => {
        if (data === null) { // A response was already sent (e.g. redirect) or a retry was initiated
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
        console.error('JIRA Summary Extension: Fetch error or other unhandled promise rejection:', error && error.message ? error.message : String(error));
        sendResponse({ error: (error && error.message) || '不明なエラーが発生しました。' });
      });
    }

    doFetch(attempt); // Initial call, retriedAfterHogeTop is false by default
    return true; // Crucial for asynchronous sendResponse
  }
});
