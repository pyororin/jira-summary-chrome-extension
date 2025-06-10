// config.jsをインポートします。これにはAPIエンドポイントなどの設定が含まれています。
importScripts('config.js');

// chrome.runtime.onMessageイベントリスナー: content scriptやpopupからのメッセージを処理します。
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // メッセージタイプがGET_JIRA_SUMMARYの場合、JIRAの要約を取得する処理を開始します。
  if (message.type === 'GET_JIRA_SUMMARY') {
    // 503エラー（Service Unavailable）の場合の最大再試行回数。
    const maxRetries = 1;
    // 現在の試行回数（503エラー用）。
    let attempt = 0;

    // JIRA課題の要約を取得するための主要な関数。
    // @param {object} message - content scriptから送られてくるメッセージオブジェクト。jiraKeyやauthRetryフラグを含む。
    // @param {number} currentAttempt - 現在の再試行回数（503エラー用）。
    // @param {boolean} retriedAfterHogeTop - (このパラメータは現在使用されていないようですが、もし特定の再試行ロジックで意味を持つ場合はコメントを修正してください)
    function doFetch(message, currentAttempt, retriedAfterHogeTop = false) {
      // API設定からJIRA要約取得APIのURLを取得します。
      const apiUrl = API_CONFIG.jiraSummaryUrl;

      // fetch APIを使用してJIRA要約APIにリクエストを送信します。
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        // messageオブジェクトからjiraKeyを直接使用してリクエストボディを作成します。
        body: JSON.stringify({ jiraKey: message.jiraKey, note: "全体の要約をお願いします。" }),
        // 'redirect: 'manual'' 設定: リダイレクトを手動で処理します。
        // これにより、fetchが自動的にリダイレクトに従うのを防ぎ、リダイレクト先のURLを取得してcontent scriptに渡すことができます。
        redirect: 'manual'
      })
      .then(response => {
        // リダイレクトの手動処理: ステータスコードが300番台で、Locationヘッダが存在する場合、リダイレクトと判断します。
        if (response.status >= 300 && response.status < 400 && response.headers.has('Location')) {
            const location = response.headers.get('Location');
            console.log(`JIRA Summary Extension (JP): リダイレクトステータス ${response.status} を検出しました。リダイレクト先: ${location}`);
            // content scriptにリダイレクト先のURLを送信します。
            sendResponse({ redirectUrl: location });
            // これ以上の処理を停止し、レスポンスは処理済みとします。
            return null;
        }

        // 401 Unauthorizedエラーの処理ロジック:
        if (response.status === 401) {
            // messageオブジェクトのauthRetryフラグを確認します。
            // このフラグは、ユーザーが認証ページへリダイレクトされた後、再度要約取得を試みたかを示します。
            if (message.authRetry) {
                console.warn('JIRA Summary Extension (JP): authRetryでの401受信。エラーとして報告します。');
                // authUrlは送信しません。後続の !response.ok ハンドラでエラーとして処理されます。
                // これにより、response.text()またはstatusTextを使用してエラーメッセージが作成されます。
            } else {
                console.log('JIRA Summary Extension (JP): 401受信（このユーザーアクションでの最初の試行）。authUrlを送信します。');
                // content scriptに認証用URL（authUrl）と現在のjiraKeyを送信し、認証フローを開始させます。
                sendResponse({ authUrl: API_CONFIG.authUrl, jiraKey: message.jiraKey });
                // 重要: ここで処理を停止し、これ以上進まないようにします。
                return null;
            }
        }

        // response.okがfalseの場合の処理 (401でauthRetry=trueの場合や、その他のクライアント/サーバーエラーを含む):
        if (!response.ok) {
            // 503 Service Unavailableエラーで、かつ最大再試行回数未満の場合の再試行ロジック:
            if (response.status === 503 && currentAttempt < maxRetries) {
                console.log(`JIRA Summary Extension (JP): 503受信、試行 ${currentAttempt + 1}/${maxRetries}回目。2秒後に再試行します...`);
                // 2秒後にdoFetchを再帰的に呼び出し、再試行します。
                setTimeout(() => {
                    // messageオブジェクトを再帰呼び出しに渡します。
                    doFetch(message, currentAttempt + 1, retriedAfterHogeTop);
                }, 2000);
                // このチェーンの処理を停止します。新しいfetchはsetTimeoutによって開始されます。
                return null;
            }

            // その他のエラー（再試行後の401、最大再試行回数を超えた503など）の場合:
            // response.text()を試み、それが空ならstatusTextを使用し、それも空なら汎用メッセージでエラーオブジェクトを作成します。
            return response.text().then(text => {
                const errorMessage = text || response.statusText || `HTTPエラー ${response.status}`;
                const err = new Error(errorMessage);
                console.warn(`JIRA Summary Extension (JP): ステータス ${response.status} のエラーを報告します。詳細: ${errorMessage}`);
                // このエラーは.catchブロックでキャッチされます。
                throw err;
            });
        }

        // ここに到達した場合、レスポンスは成功 (2xx) です。
        // レスポンスボディをJSONとしてパースします。
        return response.json();
      })
      .then(data => {
        // dataがnullの場合のチェック:
        // これは、既に応答が送信された（例：リダイレクト処理）か、再試行が開始された（例：503エラー）場合に発生します。
        // この場合、これ以上何も処理する必要はありません。
        if (data === null) {
          return;
        }

        // APIからのデータ構造を検証し、要約またはエラーをcontent scriptに送信します。
        if (data && typeof data.data !== 'undefined') {
          // 成功: 要約データを送信します。
          sendResponse({ summary: data.data });
        } else {
          console.error('JIRA Summary Extension (JP): APIからの予期しないデータ構造 (data.dataが見つかりません):', data);
          // エラー: 予期しないデータ構造の場合。
          sendResponse({ error: 'APIから予期しないデータ形式（data.dataが見つかりません）で応答がありました。' });
        }
      })
      .catch(error => {
        // fetch処理中または他の未処理のPromiseリジェクションでエラーが発生した場合の処理。
        console.error('JIRA Summary Extension (JP): fetchエラーまたはその他の未処理のPromiseリジェクション:', error && error.message ? error.message : String(error));
        // content scriptにエラーメッセージを送信します。
        sendResponse({ error: (error && error.message) || '不明なエラーが発生しました。' });
      });
    }

    // doFetch関数の初回呼び出し。messageオブジェクトと初期試行回数を渡します。
    doFetch(message, attempt);

    // `return true;` は、`sendResponse`を非同期的に使用するために不可欠です。
    // これにより、`onMessage`リスナーが`sendResponse`が呼び出されるまでオープンな状態を保ちます。
    return true;
  }
});
