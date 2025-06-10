importScripts('config.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_JIRA_SUMMARY') {
    const maxRetries = 1; // For 503 errors
    let attempt = 0; // For 503 errors

    // Pass message object to use message.jiraKey and message.authRetry
    function doFetch(message, currentAttempt, retriedAfterHogeTop = false) {
      const apiUrl = API_CONFIG.jiraSummaryUrl;

      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        // Use message.jiraKey directly
        body: JSON.stringify({ jiraKey: message.jiraKey, note: "全体の要約をお願いします。" }),
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

        // New 401 handling logic
        if (response.status === 401) {
            if (message.authRetry) { // Check the flag from the message
                console.warn('JIRA Summary Extension: Received 401 on authRetry. Reporting as error.');
                // Do NOT send authUrl. Let it fall through to the general !response.ok handler below.
                // This will then use response.text() or statusText to create an error message.
            } else {
                console.log('JIRA Summary Extension: Received 401 (first attempt for this user action). Sending authUrl.');
                sendResponse({ authUrl: API_CONFIG.authUrl, jiraKey: message.jiraKey });
                return null; // Crucial: stop further processing here
            }
        }

        // Existing non-ok (including 503 retry) and error handling
        if (!response.ok) { // This will catch 401s that fall through (including authRetry ones), and other client/server errors
            if (response.status === 503 && currentAttempt < maxRetries) {
                console.log(`JIRA Summary Extension: Received 503, attempt ${currentAttempt + 1} of ${maxRetries}. Retrying in 2 seconds...`);
                setTimeout(() => {
                    // Pass message along for recursive calls
                    doFetch(message, currentAttempt + 1, retriedAfterHogeTop);
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
          const originalErrorDetails = 'APIの応答データ形式が予期されたものではありません。';
          const userMessage = `エラーが発生しました。しばらく時間をおいてから再度お試しください。(詳細: ${originalErrorDetails})`;
          sendResponse({ error: userMessage });
        }
      })
      .catch(error => {
        console.error('JIRA Summary Extension: Fetch error or other unhandled promise rejection:', error && error.message ? error.message : String(error));
        const originalErrorDetails = (error && error.message) || '不明なエラー';
        const userMessage = `エラーが発生しました。しばらく時間をおいてから再度お試しください。(詳細: ${originalErrorDetails})`;
        sendResponse({ error: userMessage });
      });
    }

    // Initial call, pass the message object
    doFetch(message, attempt);
    return true; // Crucial for asynchronous sendResponse
  }
});
