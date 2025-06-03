document.addEventListener('DOMContentLoaded', function () {
  const jiraKeyInput = document.getElementById('jiraKey');
  const getSummaryButton = document.getElementById('getSummaryButton');
  const loadingMessage = document.getElementById('loadingMessage');
  const summaryDisplay = document.getElementById('summaryDisplay');

  getSummaryButton.addEventListener('click', function () {
    const jiraKey = jiraKeyInput.value.trim();

    if (!jiraKey) {
      summaryDisplay.textContent = 'Please enter a JIRA key.';
      return;
    }

    loadingMessage.style.display = 'block';
    summaryDisplay.textContent = ''; // Clear previous summary

    fetch('http://example.com/jira/v1/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: jiraKey }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        loadingMessage.style.display = 'none';
        if (data && data.summary) {
          typeWriterEffect(data.summary, summaryDisplay);
        } else {
          summaryDisplay.textContent = 'Failed to get summary or summary is empty.';
          console.error('Invalid data structure from API:', data);
        }
      })
      .catch(error => {
        loadingMessage.style.display = 'none';
        summaryDisplay.textContent = `Error: ${error.message}`;
        console.error('Error fetching summary:', error);
      });
  });

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
});
