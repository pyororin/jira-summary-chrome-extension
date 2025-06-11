// --- グローバル定数 ---
// ルート表示コンテナのID。ここに拡張機能のUI（メッセージエリアやボタンなど）が挿入されます。
const ROOT_DISPLAY_CONTAINER_ID = 'jiraSummaryExtensionRootContainer';
// JIRA要約表示ボタンのID。
const BUTTON_ID = 'jiraSummaryExtensionButton';

// --- グローバル変数 ---
// メッセージ表示エリアのコンテナ要素。ここにローディングメッセージ、要約、エラーメッセージなどが表示されます。
let messageAreaContainer = null;
// 認証が促されたJIRAキーを追跡する変数。
// これにより、認証後に同じJIRAキーで再試行する際に、バックグラウンドスクリプトに特別なフラグ（authRetry）を送信できます。
let promptedAuthForJiraKey = null;

// --- ユーティリティ関数 ---

/**
 * タイプライター効果でテキストを表示する関数。
 * @param {string} text - 表示するテキスト。
 * @param {HTMLElement} element - テキストを表示するHTML要素。
 * @param {number} [delay=10] - 各文字を表示する遅延時間（ミリ秒）。
 * テキストは1文字ずつ表示され、改行文字（\n）は<br>タグに変換されます。
 * また、'- 'で始まる行は太字で表示されます。
 */
function typeWriterEffect(text, element, delay = 10) {
  element.innerHTML = ''; // 要素の内容をクリア
  const lines = text.split('\n'); // テキストを行に分割
  let lineIndex = 0; // 現在の行インデックス
  element.innerHTML = ''; // 要素の内容をクリア
  let overallCharIndex = 0; // テキスト全体の文字インデックス

  function type() {
    if (overallCharIndex >= text.length) {
      return;
    }

    // Check for newline character
    if (text.substring(overallCharIndex).startsWith('\n')) {
      element.appendChild(document.createElement('br'));
      overallCharIndex++;
      setTimeout(type, delay);
      return;
    }

    // Check for bold lines (starting with '- ')
    // This check should happen at the beginning of a line.
    // We can infer this by checking if the last appended child was a <br> or if element is empty.
    let isStartOfNewLine = element.children.length === 0 || (element.lastChild && element.lastChild.nodeName.toLowerCase() === 'br');
    if (isStartOfNewLine && text.substring(overallCharIndex).startsWith('- ')) {
      const strong = document.createElement('strong');
      element.appendChild(strong);
      // Type out the '- ' part
      let i = 0;
      function typeBoldPrefix() {
        if (i < 2) {
          strong.appendChild(document.createTextNode(text.charAt(overallCharIndex)));
          overallCharIndex++;
          i++;
          setTimeout(typeBoldPrefix, delay);
        } else {
          // Continue typing the rest of the bold line or next segment
          typeSegment(strong);
        }
      }
      typeBoldPrefix();
      return;
    }

    // Check for <a> tags
    const tagRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    // Important: Create a new regex object or reset lastIndex if using exec in a loop on the same string.
    // Here, we are creating it fresh or it's implicitly reset as we call substring.
    const remainingText = text.substring(overallCharIndex);
    // We want to match only if the tag is at the beginning of the remainingText.
    // So, we can use startsWith-like behavior by checking match.index === 0.
    const match = tagRegex.exec(remainingText);

    if (match && match.index === 0) { // If an <a> tag is at the current position
      const fullMatchString = match[0];
      const href = match[1];
      const linkTextContent = match[2]; // This is the text between <a> and </a>

      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      element.appendChild(anchor);

      // Type out the link text content inside the anchor
      let currentLinkTextCharIndex = 0;
      function typeCurrentLinkText() {
        if (currentLinkTextCharIndex < linkTextContent.length) {
          anchor.appendChild(document.createTextNode(linkTextContent.charAt(currentLinkTextCharIndex)));
          currentLinkTextCharIndex++;
          // We don't advance overallCharIndex here yet,
          // it will be advanced by the fullMatchString.length after the link text is typed.
          setTimeout(typeCurrentLinkText, delay);
        } else {
          // After typing link text, advance overallCharIndex by the length of the entire <a> tag
          overallCharIndex += fullMatchString.length;
          setTimeout(type, delay); // Continue with the rest of the text
        }
      }
      typeCurrentLinkText();
    } else {
      // Type out a segment of plain text until the next tag or newline or end of text
      typeSegment(element);
    }
  }

  function typeSegment(parentElement, isBold = false) {
    let segmentCharIndex = 0;
    let currentSegmentText = "";
    let textToTypeInSegment = "";

    // Determine the end of the current plain text segment
    // It ends at the next newline, the start of an <a> tag, or the end of the total text.
    const nextNewlineIndex = text.indexOf('\n', overallCharIndex);
    const tagRegexForSegment = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    // Important: Reset lastIndex before using exec in a loop or on different parts of a string.
    // Create a new RegExp object or manually reset lastIndex.
    // For this specific search, we only care about the *next* match from overallCharIndex.
    let nextTagStartIndex = -1;
    const searchTextForTag = text.substring(overallCharIndex);
    const tagMatchInSegment = tagRegexForSegment.exec(searchTextForTag);
    if (tagMatchInSegment) {
      nextTagStartIndex = overallCharIndex + tagMatchInSegment.index;
    }

    let endOfSegment = text.length; // Assume end of total text initially

    if (nextNewlineIndex !== -1) {
      endOfSegment = Math.min(endOfSegment, nextNewlineIndex);
    }
    if (nextTagStartIndex !== -1) {
      endOfSegment = Math.min(endOfSegment, nextTagStartIndex);
    }

    textToTypeInSegment = text.substring(overallCharIndex, endOfSegment);

    if (textToTypeInSegment.length === 0) {
      // If the segment is empty (e.g., because we are exactly at a newline or a tag),
      // call type() to handle the newline/tag.
      type();
      return;
    }

    let currentSegmentCharIndex = 0;
    function typeCharInCurrentSegment() {
      if (currentSegmentCharIndex < textToTypeInSegment.length) {
        parentElement.appendChild(document.createTextNode(textToTypeInSegment.charAt(currentSegmentCharIndex)));
        currentSegmentCharIndex++;
        overallCharIndex++; // Crucially, advance the main overallCharIndex
        setTimeout(typeCharInCurrentSegment, delay);
      } else {
        // End of this plain text segment, call main type function to decide what's next
        type();
      }
    }
    typeCharInCurrentSegment();
  }
  type(); // Start the typewriter effect
}

/**
 * 現在のJIRAページからJIRAキーを取得する関数。
 * 'key-val'というIDを持つ要素からJIRAキーを抽出します。
 * @returns {string|null} JIRAキー。見つからない場合はnull。
 */
function getJiraKey() {
  const keyValElement = document.getElementById('key-val'); // JIRAキーを含む要素を取得
  if (!keyValElement) {
    console.warn('JIRA Summary Extension (JP): key-val 要素が見つかりません。');
    return null;
  }
  // 要素のテキストコンテントからJIRAキーをトリムして返す
  return keyValElement.textContent ? keyValElement.textContent.trim() : null;
}

// --- ボタン作成と管理 ---

/**
 * JIRA要約表示ボタンを作成し、ページに挿入する関数。
 * ボタンが既に存在する場合は再利用し、イベントリスナーを再設定します。
 * ボタンは 'jira-share-trigger' 要素の前に挿入されます。
 * @returns {HTMLElement|null} 作成または取得したボタン要素。挿入場所が見つからない場合はnull。
 */
function createAndInsertSummaryButton() {
  let button = document.getElementById(BUTTON_ID); // IDでボタンを検索
  if (!button) { // ボタンが存在しない場合
    button = document.createElement('button'); // 新しく作成
    button.id = BUTTON_ID;
    button.textContent = 'JIRAサマリー表示'; // ボタンのテキストを設定
  }
  // 既存のイベントリスナーを削除してから新しいリスナーを追加（重複を防ぐため）
  button.removeEventListener('click', handleSummaryButtonClick);
  button.addEventListener('click', handleSummaryButtonClick);

  // ボタンの挿入場所となる 'jira-share-trigger' 要素を取得
  const jiraShareTrigger = document.getElementById('jira-share-trigger');
  if (jiraShareTrigger && jiraShareTrigger.parentNode) { // 挿入場所とその親要素が存在する場合
    // ボタンが正しい位置にない場合のみ挿入（既に正しい位置にあれば何もしない）
    if (button.parentNode !== jiraShareTrigger.parentNode || button.nextSibling !== jiraShareTrigger) {
        jiraShareTrigger.parentNode.insertBefore(button, jiraShareTrigger); // 'jira-share-trigger'の前にボタンを挿入
    }
  } else {
    // 'jira-share-trigger' が見つからない場合、ボタンは配置できない
    console.warn('JIRA Summary Extension (JP): jira-share-trigger が見つかりません。ボタンを確実に配置できません。');
    if(button && button.parentNode) button.remove(); // ボタンが既にDOMに追加されていれば削除
    return null; // ボタンを返さない
  }
  return button; // ボタン要素を返す
}

// --- 表示エリア準備 ---

/**
 * メッセージ表示エリアを準備する関数。
 * ルート表示コンテナ（ROOT_DISPLAY_CONTAINER_ID）を探し、その中にメッセージエリア（messageAreaContainer）を作成またはクリアします。
 * @returns {boolean} 準備が成功した場合はtrue、失敗した場合はfalse。
 */
function prepareMessageArea() {
    // ルート表示コンテナを取得
    const rootDisplayContainer = document.getElementById(ROOT_DISPLAY_CONTAINER_ID);
    if (!rootDisplayContainer) {
        console.error("JIRA Summary Extension (JP): ルート表示コンテナが見つかりません。メッセージエリアを準備できません。");
        messageAreaContainer = null; // messageAreaContainerもクリア
        return false;
    }
    // messageAreaContainerが存在しない、またはルートコンテナの子でない場合（例：初回、またはDOM変更後）
    if (!messageAreaContainer || !rootDisplayContainer.contains(messageAreaContainer)) {
        rootDisplayContainer.innerHTML = ''; // ルートコンテナをクリア
        messageAreaContainer = document.createElement('div'); // 新しいメッセージエリアコンテナを作成
        messageAreaContainer.id = 'jiraSummaryMessageArea'; // IDを設定
        rootDisplayContainer.appendChild(messageAreaContainer); // ルートコンテナに追加
    } else {
        // messageAreaContainerが既に存在する場合は、内容のみクリア
        messageAreaContainer.innerHTML = '';
    }
    return true; // 準備完了
}

// --- 表示関数 ---

/**
 * ローディングメッセージを表示する関数。
 * prepareMessageAreaを呼び出し、成功すればローディングメッセージ用のdivを作成して表示します。
 */
function displayLoading() {
  if (!prepareMessageArea()) return; // メッセージエリアの準備に失敗したら何もしない
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'jiraSummaryLoading';
  loadingDiv.textContent = 'サマリーを作成しています...';
  messageAreaContainer.appendChild(loadingDiv);
}

/**
 * 要約テキストを表示する関数。
 * prepareMessageAreaを呼び出し、成功すれば要約表示用のdivを作成し、typeWriterEffectで要約を表示します。
 * @param {string} summaryText - 表示する要約テキスト。
 */
function displaySummary(summaryText) {
  if (!prepareMessageArea()) return; // メッセージエリアの準備に失敗したら何もしない
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'jiraSummaryDisplay';
  messageAreaContainer.appendChild(summaryDiv);
  typeWriterEffect(summaryText, summaryDiv); // タイプライター効果で表示
}

/**
 * エラーメッセージ（または情報メッセージ）を表示する関数。
 * prepareMessageAreaを呼び出し、成功すればエラーメッセージ用のdivを作成して表示します。
 * @param {string} errorMessage - 表示するエラーメッセージ。
 */
function displayError(errorMessage) {
  if (!prepareMessageArea()) return; // メッセージエリアの準備に失敗したら何もしない
  const errorDiv = document.createElement('div');
  errorDiv.id = 'jiraSummaryError'; // スタイル分けのためにIDを設定
  errorDiv.textContent = errorMessage;
  messageAreaContainer.appendChild(errorDiv);
}

/**
 * HTMLコンテンツを含むメッセージを表示する関数。
 * 認証リンクなど、HTMLタグを含むメッセージを表示するのに使用します。
 * @param {string} htmlContent - 表示するHTML文字列。
 * @param {string} [type='info'] - メッセージのタイプ（例: 'error', 'info', 'auth'）。ID生成に使用され、スタイリングに利用可能。
 */
function displayHtmlMessage(htmlContent, type = 'info') {
  if (!prepareMessageArea()) return; // メッセージエリアの準備に失敗したら何もしない
  const messageDiv = document.createElement('div');
  messageDiv.id = `jiraSummaryMessage-${type}`; // タイプに基づいたIDを設定
  messageDiv.innerHTML = htmlContent; // innerHTMLを使用してHTMLを解釈
  messageAreaContainer.appendChild(messageDiv);
}

// --- ボタンのイベントハンドラ ---

/**
 * 「JIRAサマリー表示」ボタンがクリックされたときの処理を行う関数。
 */
function handleSummaryButtonClick() {
    // messageAreaContainerが未初期化で、prepareMessageAreaも失敗した場合（致命的な状態）
    if (!messageAreaContainer && !prepareMessageArea()) {
        console.error("JIRA Summary Extension (JP): メッセージエリアコンテナが初期化されておらず、準備もできませんでした。");
        alert("拡張機能の表示エリアが準備できていません。ページを再読み込みしてみてください。");
        return;
    }

    // JIRAキーを取得
    const jiraKey = getJiraKey();
    if (!jiraKey) { // JIRAキーが見つからない場合
      displayError('JIRAキーが見つかりません。');
      return;
    }

    displayLoading(); // ローディングメッセージを表示

    // バックグラウンドスクリプトへ送信するメッセージペイロードを作成
    const messagePayload = { type: 'GET_JIRA_SUMMARY', jiraKey: jiraKey };
    // 現在のJIRAキーに対して以前認証が促された場合、authRetryフラグをtrueに設定
    if (promptedAuthForJiraKey === jiraKey) {
        messagePayload.authRetry = true;
    }

    // バックグラウンドスクリプトにメッセージを送信
    chrome.runtime.sendMessage(
      messagePayload,
      (response) => {
        // メッセージエリアの利用可能性を再度確認
        // リダイレクトや認証URLがない状況でメッセージエリアが利用不可になった場合は問題
        if (!prepareMessageArea() && !(response && (response.redirectUrl || response.authUrl))) {
             console.error("JIRA Summary Extension (JP): API呼び出し中にメッセージエリアが利用不可になり、表示すべきリダイレクト/認証URLもありません。");
             // responseがない、またはredirectUrlもauthUrlもない場合は、これ以上進めない
             if (!response || (!response.redirectUrl && !response.authUrl)) return;
        }

        // chrome.runtime.lastErrorが存在する場合（メッセージ送信失敗など）
        if (chrome.runtime.lastError) {
          console.error('JIRA Summary Extension (JP): メッセージ送信失敗:', chrome.runtime.lastError.message);
          displayError(`拡張機能エラー: ${chrome.runtime.lastError.message}`);
          promptedAuthForJiraKey = null; // ランタイムエラー時にリセット
          return;
        }

        if (response) { // バックグラウンドからの応答がある場合
            // authUrlが存在する場合（認証が必要な場合）: これが最優先の情報
            if (response.authUrl && response.jiraKey) {
                const authMessage = `認証が必要です。 <a href='${response.authUrl}' target='_blank' rel='noopener noreferrer'>こちらをクリックしてログイン</a>し、その後再度「サマリー表示」ボタンを押してください。`;
                displayHtmlMessage(authMessage, 'auth'); // 認証メッセージをHTMLで表示
                // このJIRAキーに対して認証が促されたことを記録
                promptedAuthForJiraKey = response.jiraKey;
            } else {
                // authUrlがない、またはresponse.jiraKeyがauthUrlレスポンスにない場合。
                // これは、以前の任意のキーに対する認証プロンプトサイクルが終了したことを意味する。
                promptedAuthForJiraKey = null;

                // その他のレスポンスタイプを処理
                if (response.redirectUrl) { // リダイレクトURLがある場合
                    chrome.tabs.create({ url: response.redirectUrl, active: true }); // 新しいタブでURLを開く
                    displayError('認証が必要です。新しいタブで認証を完了し、再度「サマリー表示」ボタンを押してください。');
                } else if (response.error) { // エラーがある場合 (authRetry後の401も含む)
                    displayError(`エラー: ${response.error}`);
                } else if (typeof response.summary !== 'undefined') { // 要約がある場合
                    displaySummary(response.summary);
                } else {
                    // responseがnullでなく、既知の成功/認証/エラー/リダイレクトタイプに一致しない場合。
                    // jiraKeyが欠けていたauthUrlレスポンス（予期しない）である可能性もある。
                    displayError('不明な応答がバックグラウンドから返されました。');
                }
            }
        } else { // バックグラウンドからの応答がない場合
          displayError('バックグラウンドスクリプトからの応答がありません。');
          promptedAuthForJiraKey = null; // 応答なしの場合もリセット
        }
      }
    );
}

// --- メイン実行ロジック ---
// ページ内の特定要素が表示されるのを待って、拡張機能のUIを初期化するインターバル処理。
const checkInterval = setInterval(() => {
  // 監視対象のJIRAページ要素
  const jiraKeyValElement = document.getElementById('key-val'); // JIRAキー表示要素
  const jiraShareTriggerElement = document.getElementById('jira-share-trigger'); // 共有ボタン（ボタン挿入の目印）
  const slackPanel = document.getElementById('slack-viewissue-panel'); // Slack連携パネル（表示コンテナ挿入の目印）

  let displayInsertionPoint = null; // 拡張機能の表示コンテナを挿入する場所
  // Slackパネルが存在し、その2番目の子要素があれば、それを挿入ポイントとする
  // (JIRAのDOM構造に依存するため、変更に弱い可能性あり)
  if (slackPanel && slackPanel.children[1]) {
      displayInsertionPoint = slackPanel.children[1];
  }

  // 必要な要素が全て揃い、かつ表示コンテナの挿入ポイントが見つかった場合
  if (jiraKeyValElement && jiraShareTriggerElement && displayInsertionPoint) {
    clearInterval(checkInterval); // インターバルを停止

    // ルート表示コンテナ（拡張機能のUI全体を囲む）を取得または作成
    let rootDisplayContainer = document.getElementById(ROOT_DISPLAY_CONTAINER_ID);
    if (!rootDisplayContainer) { // まだ存在しない場合
        rootDisplayContainer = document.createElement('div');
        rootDisplayContainer.id = ROOT_DISPLAY_CONTAINER_ID;
        // displayInsertionPointの後にルート表示コンテナを挿入
        displayInsertionPoint.insertAdjacentElement('afterend', rootDisplayContainer);
    }

    // メッセージ表示エリアを準備
    if (!prepareMessageArea()) {
        console.error("JIRA Summary Extension (JP): 初期セットアップでメッセージエリアの準備に失敗しました。中止します。");
        return; // 失敗したらここで終了
    }

    // 要約表示ボタンを作成・挿入
    createAndInsertSummaryButton();
  }
}, 500); // 500ミリ秒ごとにチェック

[end of content.js]
