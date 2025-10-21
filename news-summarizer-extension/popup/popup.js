class NewsPopup {
  constructor() {
    this.fetchBtn = document.getElementById('fetchBtn');
    this.btnText = document.getElementById('btnText');
    this.spinner = document.getElementById('spinner');
    this.results = document.getElementById('results');
    this.summaryList = document.getElementById('summaryList');
    this.error = document.getElementById('error');

    this.init();
  }

  init() {
    this.loadUserPreferences();
    this.fetchBtn.addEventListener('click', () => this.handleFetch());

    // Add test button for debugging
    const testBtn = document.getElementById('testBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        console.log('Test button clicked - testing basic link opening');
        
        // Test with Google to verify link opening works
        const testUrl = 'https://www.google.com';
        console.log('Testing link opening with:', testUrl);
        
        // Try the most basic approach first
        console.log('Attempting basic chrome.tabs.create...');
        if (chrome && chrome.tabs) {
          chrome.tabs.create({ url: testUrl }, (tab) => {
            if (chrome.runtime.lastError) {
              console.error('Basic test failed:', chrome.runtime.lastError);
              // Try window.open as backup
              try {
                window.open(testUrl, '_blank');
                alert('Opened with window.open (Chrome tabs failed)');
              } catch (e) {
                alert('All methods failed: ' + chrome.runtime.lastError.message);
              }
            } else {
              console.log('Basic test succeeded:', tab);
              alert('✅ Tab opened successfully with Chrome tabs API!');
            }
          });
        } else {
          console.error('Chrome tabs API not available');
          try {
            window.open(testUrl, '_blank');
            alert('✅ Opened with window.open (Chrome tabs not available)');
          } catch (e) {
            alert('❌ All methods failed');
          }
        }
      });
    }

    // Add AI status checker
    const checkAiBtn = document.getElementById('checkAiBtn');
    if (checkAiBtn) {
      checkAiBtn.addEventListener('click', () => {
        this.checkGeminiNanoStatus();
      });
    }

    // Check Chrome version on load
    this.checkChromeVersion();

    // Add dashboard button
    const dashboardBtn = document.getElementById('openDashboardBtn');
    if (dashboardBtn) {
      dashboardBtn.addEventListener('click', () => {
        this.openDashboard();
      });
    }

    // Add clear keywords button
    const clearKeywordsBtn = document.getElementById('clearKeywordsBtn');
    if (clearKeywordsBtn) {
      clearKeywordsBtn.addEventListener('click', () => {
        document.getElementById('keywordInput').value = '';
        console.log('Keywords cleared');
      });
    }
  }

  async loadUserPreferences() {
    try {
      const data = await chrome.storage.sync.get(['selectedSources', 'newsType']);

      if (data.selectedSources) {
        data.selectedSources.forEach(source => {
          const checkbox = document.getElementById(source);
          if (checkbox) checkbox.checked = true;
        });
      }

      if (data.newsType) {
        const radio = document.querySelector(`input[name="newsType"][value="${data.newsType}"]`);
        if (radio) radio.checked = true;
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }

  async saveUserPreferences() {
    const selectedSources = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value);
    const newsType = document.querySelector('input[name="newsType"]:checked').value;

    await chrome.storage.sync.set({
      selectedSources,
      newsType
    });
  }

  async handleFetch() {
    try {
      this.showLoading(true);
      this.hideError();
      this.hideResults();

      await this.saveUserPreferences();

      const selectedSources = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value);
      const newsType = document.querySelector('input[name="newsType"]:checked').value;
      const keywords = document.getElementById('keywordInput').value.trim();

      if (selectedSources.length === 0) {
        throw new Error('Please select at least one news source');
      }

      // Show keyword status
      if (keywords) {
        console.log('Fetching news with keywords:', keywords);
        this.btnText.textContent = `Searching for "${keywords}"...`;
      } else {
        console.log('Fetching general news');
        this.btnText.textContent = 'Fetching news...';
      }

      const result = await this.fetchAndSummarize(selectedSources, newsType, keywords);
      this.displayResults(result.summaries || result, keywords, result.dateRange);

    } catch (error) {
      this.showError(error.message);
    } finally {
      this.showLoading(false);
    }
  }

  async fetchAndSummarize(sources, newsType, keywords = '') {
    return new Promise((resolve, reject) => {
      console.log('Sending message to background script:', { sources, newsType, keywords });

      chrome.runtime.sendMessage({
        action: 'fetchNews',
        sources,
        newsType,
        keywords
      }, async (response) => {
        console.log('Received response:', response);

        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          console.error('Response error:', response.error);
          reject(new Error(response.error));
        } else if (response && (response.summaries || response.message)) {
          // Handle case where we have a message but no summaries
          if (response.summaries && response.summaries.length === 0 && response.message) {
            // Pass through the detailed error message from background script
            reject(new Error(response.message));
            return;
          }
          console.log('Got summaries from background:', response.summaries?.length || 0);

          // If we have a working AI model, re-summarize with AI
          console.log('Checking AI availability:', {
            workingLanguageModel: !!this.workingLanguageModel,
            LanguageModelAvailable: typeof LanguageModel !== 'undefined',
            userActivation: navigator.userActivation?.isActive
          });

          if (this.workingLanguageModel || typeof LanguageModel !== 'undefined') {
            console.log('Generating fresh news articles with Prompt API...');

            try {
              const aiGeneratedNews = await this.generateNewsWithPromptAPI(sources, newsType, keywords);
              console.log('AI news generation complete:', aiGeneratedNews.length, 'articles');
              resolve(aiGeneratedNews);
            } catch (error) {
              console.error('AI news generation failed, falling back to summarization:', error);
              // Fallback: re-summarize background articles
              console.log('Re-summarizing background articles with AI...');
              const aiSummaries = [];

              for (const summary of response.summaries) {
                try {
                  const aiSummary = await this.summarizeWithAi(summary.summary);
                  aiSummaries.push({
                    ...summary,
                    summary: aiSummary
                  });
                } catch (error) {
                  console.error('AI summarization failed for article:', error);
                  aiSummaries.push(summary);
                }
              }

              console.log('AI summarization complete');
              resolve({
                summaries: aiSummaries,
                dateRange: response.dateRange || '24 hours',
                keywordSearch: response.keywordSearch || false
              });
            }
          } else {
            resolve({
              summaries: response.summaries,
              dateRange: response.dateRange || '24 hours',
              keywordSearch: response.keywordSearch || false
            });
          }
        } else {
          console.error('Invalid response format:', response);
          reject(new Error('Invalid response from background script'));
        }
      });
    });
  }

  displayResults(summaries, keywords = '', dateRange = '24 hours') {
    console.log('=== DISPLAY RESULTS DEBUG ===');
    console.log('Summaries received:', summaries);
    console.log('Number of summaries:', summaries?.length);
    console.log('Date range:', dateRange);
    console.log('Keywords:', keywords);
    
    // Use passed keywords or get from input
    const searchKeywords = keywords || document.getElementById('keywordInput').value.trim();
    
    if (!summaries || summaries.length === 0) {
      if (searchKeywords) {
        // More specific error message based on time range
        if (dateRange === '2 weeks') {
          this.showError(`No articles found matching keywords: "${searchKeywords}" in the past 2 weeks. Try different keywords, check spelling, or remove keywords for general news.`);
        } else {
          this.showError(`No articles found matching keywords: "${searchKeywords}" in the past 24 hours. Try different keywords, check spelling, or remove keywords for general news.`);
        }
      } else {
        this.showError('No news articles found');
      }
      return;
    }

    this.summaryList.innerHTML = '';

    // Add status header with adaptive date range
    const statusHeader = document.createElement('div');
    const isExpanded = dateRange === '2 weeks';
    const headerColor = isExpanded ? '#fff3cd' : '#f0f8ff';
    const borderColor = isExpanded ? '#ffc107' : '#1976d2';
    const textColor = isExpanded ? '#856404' : '#2c5aa0';
    
    statusHeader.style.cssText = `background: ${headerColor}; padding: 8px; border-radius: 4px; margin-bottom: 12px; font-size: 11px; color: ${textColor}; border-left: 3px solid ${borderColor};`;
    
    let statusText = `📅 <strong>Latest News:</strong> Past ${dateRange} • ${summaries.length} articles found`;
    
    if (searchKeywords) {
      const expandedNote = isExpanded ? ' (expanded search)' : '';
      statusText = `🔍 <strong>Search Results:</strong> "${searchKeywords}" (Past ${dateRange}${expandedNote}) • ${summaries.length} matching articles`;
      
      if (isExpanded) {
        statusText += `<br><small>💡 Expanded to 2 weeks to find more results for your search</small>`;
      }
    }
    
    statusHeader.innerHTML = statusText;
    this.summaryList.appendChild(statusHeader);

    summaries.forEach((summary, index) => {
      console.log(`=== SUMMARY ${index} DEBUG ===`);
      console.log('Summary object:', summary);
      console.log('Summary URL:', summary.url);
      console.log('Summary title:', summary.title);
      console.log('Summary source:', summary.source);
      const item = document.createElement('div');
      item.className = 'summary-item';

      // Create title link that uses Chrome tabs API
      const titleLink = document.createElement('a');
      titleLink.href = summary.url; // Set actual href as backup
      titleLink.className = 'summary-title';
      titleLink.textContent = summary.title + ' ↗';
      titleLink.title = 'Click to open article in new tab';
      titleLink.target = '_blank'; // Backup method
      titleLink.addEventListener('click', (e) => {
        console.log('=== LINK CLICK DEBUG ===');
        console.log('Link clicked:', summary.title);
        console.log('URL to open:', summary.url);
        console.log('URL type:', typeof summary.url);
        console.log('URL valid:', summary.url && summary.url.startsWith('http'));

        // Ensure we have a valid URL
        let urlToOpen = summary.url;
        if (!urlToOpen || !urlToOpen.startsWith('http')) {
          console.warn('Invalid URL, skipping article');
          this.showError('Invalid article URL');
          e.preventDefault();
          return;
        }

        // Check if user wants to use default browser behavior (Ctrl+click, middle click, etc.)
        if (e.ctrlKey || e.metaKey || e.button === 1) {
          console.log('User modifier detected, allowing default behavior');
          return; // Let browser handle it normally
        }

        // Prevent default and use our custom opening logic
        e.preventDefault();

        // Visual feedback
        titleLink.style.color = '#666';
        titleLink.textContent = summary.title + ' ⏳ Opening...';

        console.log('Final URL to open:', urlToOpen);
        console.log('About to call openLinkDirect...');

        // Use the most reliable method - direct Chrome tabs API
        console.log('Opening URL with Chrome tabs API...');
        
        if (chrome && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: urlToOpen }, (tab) => {
            if (chrome.runtime.lastError) {
              console.error('Chrome tabs failed:', chrome.runtime.lastError.message);
              // Try window.open as fallback
              try {
                window.open(urlToOpen, '_blank');
                console.log('window.open fallback succeeded');
              } catch (e) {
                console.error('All methods failed:', e);
                this.showError('Could not open article. URL: ' + urlToOpen);
              }
            } else {
              console.log('✅ Article opened successfully in tab:', tab.id);
            }
            
            // Reset visual feedback
            setTimeout(() => {
              titleLink.style.color = '';
              titleLink.textContent = summary.title + ' ↗';
            }, 1000);
          });
        } else {
          console.log('Chrome tabs not available, using window.open');
          try {
            window.open(urlToOpen, '_blank');
            console.log('window.open succeeded');
          } catch (e) {
            console.error('window.open failed:', e);
            this.showError('Could not open article. URL: ' + urlToOpen);
          }
        }
      });

      // Create category and time info
      const metaInfo = document.createElement('div');
      metaInfo.className = 'summary-meta';
      metaInfo.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 4px;';

      const categoryText = summary.category || 'News';
      const timeText = summary.timeAgo || 'Recent';
      metaInfo.textContent = `${categoryText} • ${timeText}`;

      // Create summary text
      const summaryText = document.createElement('div');
      summaryText.className = 'summary-text';
      summaryText.textContent = summary.summary;

      // Create source info
      const sourceInfo = document.createElement('div');
      sourceInfo.className = 'summary-source';
      sourceInfo.textContent = summary.source;

      // Assemble the item
      item.appendChild(metaInfo);
      item.appendChild(titleLink);
      item.appendChild(summaryText);
      item.appendChild(sourceInfo);

      this.summaryList.appendChild(item);
    });

    // Sync articles to dashboard
    this.syncToDashboard(summaries);

    this.showResults();
  }

  async syncToDashboard(summaries) {
    try {
      // Add category information based on current selection
      const newsType = document.querySelector('input[name="newsType"]:checked').value;
      const articlesWithCategory = summaries.map(summary => ({
        ...summary,
        category: newsType,
        timestamp: Date.now()
      }));

      chrome.runtime.sendMessage({
        action: 'syncToDashboard',
        articles: articlesWithCategory
      }, (response) => {
        if (response && response.success) {
          console.log('Articles synced to dashboard:', response.count);
        }
      });
    } catch (error) {
      console.error('Error syncing to dashboard:', error);
    }
  }

  openDashboard() {
    // Open the dashboard website - user needs to run it locally
    const dashboardUrl = 'http://localhost:8080';

    // Try to open the local server first
    chrome.tabs.create({ url: dashboardUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        // If local server isn't running, show instructions
        this.showDashboardInstructions();
      }
    });
  }

  showDashboardInstructions() {
    const instructions = `
To use the News Dashboard:

1. Open Terminal/Command Prompt
2. Navigate to the news-dashboard folder
3. Run: python server.py
4. Dashboard will open at http://localhost:8080

Or simply open news-dashboard/index.html in your browser!
    `;

    alert(instructions);

    // Also try to open the file directly
    const fileUrl = window.location.protocol === 'file:' ?
      '../news-dashboard/index.html' :
      'news-dashboard/index.html';

    chrome.tabs.create({ url: fileUrl });
  }

  openLinkDirect(url) {
    console.log('=== DIRECT LINK OPENING ===');
    console.log('URL:', url);

    // Validate URL
    if (!url || !url.startsWith('http')) {
      console.error('Invalid URL for direct opening:', url);
      return;
    }

    // Method 1: Try Chrome tabs API directly
    if (chrome && chrome.tabs && chrome.tabs.create) {
      console.log('Using Chrome tabs API...');
      console.log('chrome.tabs.create available:', !!chrome.tabs.create);
      
      try {
        chrome.tabs.create({ url: url }, (tab) => {
          console.log('Chrome tabs callback executed');
          if (chrome.runtime.lastError) {
            console.error('Chrome tabs API failed:', chrome.runtime.lastError.message);
            this.openLinkFallback(url);
          } else {
            console.log('✅ Tab opened successfully with ID:', tab?.id);
            console.log('Tab object:', tab);
            // Don't close popup immediately - let user see it worked
            setTimeout(() => window.close(), 500);
          }
        });
        console.log('chrome.tabs.create called successfully');
      } catch (error) {
        console.error('Exception in chrome.tabs.create:', error);
        this.openLinkFallback(url);
      }
    } else {
      console.log('Chrome tabs API not available');
      console.log('chrome:', !!chrome);
      console.log('chrome.tabs:', !!chrome?.tabs);
      console.log('chrome.tabs.create:', !!chrome?.tabs?.create);
      this.openLinkFallback(url);
    }
  }

  openLinkFallback(url) {
    console.log('=== FALLBACK LINK OPENING ===');
    console.log('URL:', url);

    // Method 2: Try background script
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      console.log('Trying background script...');
      chrome.runtime.sendMessage({
        action: 'openTab',
        url: url
      }, (response) => {
        if (chrome.runtime.lastError || !response || response.error) {
          console.error('Background script failed:', chrome.runtime.lastError?.message || response?.error);
          this.openLinkWindowOpen(url);
        } else {
          console.log('✅ Background script opened tab successfully');
          setTimeout(() => window.close(), 500);
        }
      });
    } else {
      console.log('Chrome runtime not available, using window.open');
      this.openLinkWindowOpen(url);
    }
  }

  openLinkWindowOpen(url) {
    console.log('=== WINDOW.OPEN FALLBACK ===');
    console.log('URL:', url);

    try {
      const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (newWindow) {
        console.log('✅ window.open succeeded');
        setTimeout(() => window.close(), 500);
      } else {
        console.error('❌ window.open was blocked');
        this.showError('Pop-up blocked. Please allow pop-ups for this extension or copy the URL manually.');
      }
    } catch (error) {
      console.error('❌ window.open failed:', error);
      this.showError('Unable to open link. URL: ' + url);
    }
  }

  // Keep the old function for backward compatibility
  openLink(url) {
    this.openLinkDirect(url);
  }

  openLinkViaBackground(url) {
    console.log('Using background script to open link:', url);
    chrome.runtime.sendMessage({
      action: 'openTab',
      url: url
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Background tab opening failed:', chrome.runtime.lastError);
        console.log('Trying final fallback: window.open');
        // Final fallback: try window.open
        try {
          window.open(url, '_blank');
          console.log('window.open succeeded');
          setTimeout(() => window.close(), 100);
        } catch (e) {
          console.error('window.open also failed:', e);
          this.showError('Unable to open link. Please copy the URL manually.');
        }
      } else {
        console.log('Link opened via background script:', response);
        // Close popup after opening link
        setTimeout(() => window.close(), 100);
      }
    });
  }

  showLoading(show) {
    this.fetchBtn.disabled = show;
    if (show) {
      this.btnText.textContent = 'Processing...';
      this.spinner.classList.remove('hidden');
    } else {
      this.btnText.textContent = 'Fetch & Summarize';
      this.spinner.classList.add('hidden');
    }
  }

  showResults() {
    this.results.classList.remove('hidden');
  }

  hideResults() {
    this.results.classList.add('hidden');
  }

  showError(message) {
    this.error.textContent = message;
    this.error.classList.remove('hidden');
  }

  hideError() {
    this.error.classList.add('hidden');
  }

  checkChromeVersion() {
    const userAgent = navigator.userAgent;
    const chromeMatch = userAgent.match(/Chrome\/(\d+)/);

    if (chromeMatch) {
      const version = parseInt(chromeMatch[1]);
      console.log('Chrome version:', version);

      if (version < 121) {
        console.warn('Chrome version too old for Gemini Nano:', version);
      }
    }
  }

  async detectAvailableAiApis() {
    const statusText = document.getElementById('aiStatusText');

    console.log('Checking user activation:', navigator.userActivation?.isActive);
    console.log('Available globals:', {
      LanguageModel: typeof LanguageModel,
      'window.ai': typeof window.ai,
      'window.chrome.aiOriginTrial': typeof window.chrome?.aiOriginTrial
    });

    // Method 1: Direct LanguageModel constructor (like your working example)
    if (typeof LanguageModel !== 'undefined') {
      console.log('Found LanguageModel constructor');
      return await this.testDirectLanguageModel();
    }

    // Method 2: Standard window.ai
    if (window.ai && window.ai.languageModel) {
      console.log('Found window.ai.languageModel');
      return await this.testAiApi(window.ai, 'window.ai');
    }

    // Method 3: Chrome AI Origin Trial
    if (window.chrome && window.chrome.aiOriginTrial) {
      console.log('Found chrome.aiOriginTrial');
      return await this.testAiApi(window.chrome.aiOriginTrial, 'chrome.aiOriginTrial');
    }

    // Method 4: Check for global AI constructors
    const globalConstructors = ['LanguageModel', 'AILanguageModel', 'ChromeAI'];
    for (const constructorName of globalConstructors) {
      if (typeof window[constructorName] !== 'undefined') {
        console.log(`Found global constructor: ${constructorName}`);
        try {
          return await this.testGlobalConstructor(window[constructorName], constructorName);
        } catch (error) {
          console.log(`${constructorName} failed:`, error.message);
        }
      }
    }

    // If all methods fail, show detailed status
    statusText.innerHTML = `
      <div style="color: #f39c12; font-weight: bold;">⚠️ AI API Not Accessible</div>
      <div>Chrome internals show: PromptApi & Summarize active</div>
      <div>But APIs not accessible in extension context</div>
      <div><strong>Possible causes:</strong></div>
      <div>• Extension context limitations</div>
      <div>• User activation required</div>
      <div>• Origin trial scope restrictions</div>
      <div><strong>Using fallback summarization</strong></div>
    `;

    return false;
  }

  async testDirectLanguageModel() {
    const statusText = document.getElementById('aiStatusText');

    try {
      console.log('Testing direct LanguageModel constructor...');

      // Check if user activation is available
      if (!navigator.userActivation?.isActive) {
        statusText.innerHTML = `
          <div style="color: #f39c12; font-weight: bold;">⚠️ User Activation Required</div>
          <div>LanguageModel constructor available</div>
          <div>But requires user interaction</div>
          <div>Click "Test AI" button to activate</div>
        `;

        // Add a test button that will have user activation
        this.addTestAiButton();
        return false;
      }

      // Try to create LanguageModel like your working example
      const languageModel = await this.createLanguageModel({
        initialPrompts: [{
          role: 'system',
          content: 'You are a professional news summarizer. Create concise, factual summaries.'
        }]
      });

      console.log('LanguageModel created successfully');

      // Test with a simple prompt
      const testResponse = await languageModel.prompt("Test prompt");
      console.log('Test response:', testResponse);

      statusText.innerHTML = `
        <div style="color: #28a745; font-weight: bold;">✅ LanguageModel Available</div>
        <div>Direct constructor working</div>
        <div>Ready for AI summarization!</div>
      `;

      // Store the working model
      this.workingLanguageModel = languageModel;
      this.workingApiName = 'LanguageModel';

      return true;

    } catch (error) {
      console.error('LanguageModel test failed:', error);
      statusText.innerHTML = `
        <div style="color: #dc3545; font-weight: bold;">❌ LanguageModel Error</div>
        <div>Error: ${error.message}</div>
        <div>Using fallback summarization</div>
      `;
      return false;
    }
  }

  addTestAiButton() {
    // Remove existing test button if any
    const existingBtn = document.getElementById('testAiBtn');
    if (existingBtn) existingBtn.remove();

    // Create test button
    const testBtn = document.createElement('button');
    testBtn.id = 'testAiBtn';
    testBtn.textContent = '🤖 Test AI (Click to Activate)';
    testBtn.style.cssText = `
      margin-top: 8px; 
      padding: 8px 16px; 
      background: #4caf50; 
      color: white; 
      border: none; 
      border-radius: 6px; 
      font-size: 12px; 
      cursor: pointer;
      width: 100%;
    `;

    testBtn.addEventListener('click', async () => {
      console.log('Test AI button clicked, user activation:', navigator.userActivation?.isActive);
      await this.testDirectLanguageModel();
    });

    // Add after the AI status div
    const aiStatus = document.getElementById('aiStatus');
    aiStatus.parentNode.insertBefore(testBtn, aiStatus.nextSibling);
  }

  async testGlobalConstructor(Constructor, name) {
    try {
      const instance = await Constructor.create({
        outputLanguage: "en",
        initialPrompts: [{
          role: 'system',
          content: 'You are a helpful assistant.'
        }]
      });

      console.log(`${name} created successfully`);
      this.workingLanguageModel = instance;
      this.workingApiName = name;
      return true;

    } catch (error) {
      console.error(`${name} failed:`, error);
      return false;
    }
  }

  async testAiApi(api, apiName) {
    const statusText = document.getElementById('aiStatusText');

    try {
      console.log(`Testing ${apiName}...`);

      if (!api.languageModel) {
        throw new Error('languageModel not available');
      }

      const capabilities = await api.languageModel.capabilities();
      console.log(`${apiName} capabilities:`, capabilities);

      if (capabilities.available === 'no') {
        statusText.innerHTML = `
          <div style="color: #dc3545; font-weight: bold;">❌ AI Not Supported</div>
          <div>API: ${apiName}</div>
          <div>Reason: Not supported on this device</div>
        `;
        return false;
      }

      if (capabilities.available === 'after-download') {
        statusText.innerHTML = `
          <div style="color: #f39c12; font-weight: bold;">⏳ AI Model Downloading</div>
          <div>API: ${apiName}</div>
          <div>Status: Model is downloading</div>
          <div>Please wait and try again later</div>
        `;
        return false;
      }

      // Try to create a test session
      const testSession = await api.languageModel.create({
        outputLanguage: "en",
        systemPrompt: 'You are a test assistant.'
      });

      console.log(`${apiName} test session created successfully`);
      testSession.destroy();

      statusText.innerHTML = `
        <div style="color: #28a745; font-weight: bold;">✅ AI Available</div>
        <div>API: ${apiName}</div>
        <div>Status: ${capabilities.available}</div>
        <div>Ready for AI summarization!</div>
      `;

      // Store the working API for later use
      this.workingAiApi = api;
      this.workingApiName = apiName;

      return true;

    } catch (error) {
      console.error(`${apiName} test failed:`, error);
      statusText.innerHTML = `
        <div style="color: #dc3545; font-weight: bold;">❌ ${apiName} Error</div>
        <div>Error: ${error.message}</div>
        <div>Using fallback summarization</div>
      `;
      return false;
    }
  }

  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  async checkGeminiNanoStatus() {
    const statusDiv = document.getElementById('aiStatus');
    const statusText = document.getElementById('aiStatusText');

    statusDiv.style.display = 'block';
    statusText.innerHTML = 'Checking Gemini Nano status...';

    try {
      // Check AI status directly in popup context where window.ai is available
      console.log('Checking AI APIs...');
      console.log('window.ai:', window.ai);
      console.log('window.chrome?.aiOriginTrial:', window.chrome?.aiOriginTrial);
      console.log('navigator.ml:', navigator.ml);
      console.log('Chrome version:', navigator.userAgent);

      // Try different API access methods
      await this.detectAvailableAiApis();

      if (!window.ai) {
        statusText.innerHTML = `
          <div style="color: #dc3545; font-weight: bold;">❌ Gemini Nano Not Available</div>
          <div>Reason: window.ai not available</div>
          <div><strong>Troubleshooting:</strong></div>
          <div>1. Enable chrome://flags/#optimization-guide-on-device-model</div>
          <div>2. Restart Chrome completely</div>
          <div>3. Wait 2-3 minutes after restart</div>
          <div>4. Check Chrome version (need 121+)</div>
        `;
        return;
      }

      if (!window.ai.languageModel) {
        statusText.innerHTML = `
          <div style="color: #dc3545; font-weight: bold;">❌ Gemini Nano Not Available</div>
          <div>Reason: window.ai.languageModel not available</div>
          <div>Enable Chrome flags and restart Chrome</div>
        `;
        return;
      }

      console.log('Getting AI capabilities...');
      const capabilities = await window.ai.languageModel.capabilities();
      console.log('AI capabilities:', capabilities);

      if (capabilities.available === 'no') {
        statusText.innerHTML = `
          <div style="color: #dc3545; font-weight: bold;">❌ Gemini Nano Not Available</div>
          <div>Reason: Not supported on this device</div>
          <div>Using fallback summarization</div>
        `;
        return;
      }

      if (capabilities.available === 'after-download') {
        statusText.innerHTML = `
          <div style="color: #f39c12; font-weight: bold;">⏳ Gemini Nano Downloading</div>
          <div>Status: Model is downloading</div>
          <div>Please wait and try again later</div>
        `;
        return;
      }

      // Try to create a test session
      console.log('Creating test session...');
      const testSession = await window.ai.languageModel.create({
        outputLanguage: "en",
        systemPrompt: 'You are a test assistant.'
      });

      console.log('Test session created successfully');
      testSession.destroy();

      statusText.innerHTML = `
        <div style="color: #28a745; font-weight: bold;">✅ Gemini Nano Available</div>
        <div>Status: ${capabilities.available}</div>
        <div>Model: Gemini Nano</div>
        <div>Ready for AI summarization!</div>
      `;

    } catch (error) {
      console.error('Error checking AI status:', error);
      statusText.innerHTML = `
        <div style="color: #dc3545; font-weight: bold;">❌ Error Checking Status</div>
        <div>Error: ${error.message}</div>
        <div>Using fallback summarization</div>
      `;
    }
  }
  async summarizeWithAi(text) {
    // Try direct LanguageModel first
    if (this.workingLanguageModel) {
      try {
        console.log(`Using ${this.workingApiName} for summarization`);

        const cleanText = text.replace(/\s+/g, ' ').trim();
        const prompt = `Summarize this news article in exactly 1-2 clear sentences:\n\n${cleanText.substring(0, 1000)}`;

        const result = await this.workingLanguageModel.prompt(prompt);
        console.log('AI summarization successful');
        return result.trim();

      } catch (error) {
        console.error('AI summarization failed:', error);
        return this.fallbackSummarize(text);
      }
    }

    // Try to create new LanguageModel if none exists
    if (typeof LanguageModel !== 'undefined') {
      try {
        console.log('Creating new LanguageModel for summarization');
        console.log('User activation status:', navigator.userActivation?.isActive);

        const languageModel = await this.createLanguageModel({
          initialPrompts: [{
            role: 'system',
            content: 'You are a professional news summarizer. Create concise, factual summaries of news articles in exactly 1-2 clear sentences. Focus on the main facts and key information.'
          }]
        });

        const cleanText = text.replace(/\s+/g, ' ').trim();
        const prompt = `Summarize this news article in exactly 1-2 clear sentences:\n\n${cleanText.substring(0, 1000)}`;

        const result = await languageModel.prompt(prompt);

        // Store for future use
        this.workingLanguageModel = languageModel;
        this.workingApiName = 'LanguageModel';

        console.log('AI summarization successful with new model');
        return result.trim();

      } catch (error) {
        console.error('New LanguageModel creation failed:', error);
        return this.fallbackSummarize(text);
      }
    }

    console.log('No AI API available, using fallback');
    return this.fallbackSummarize(text);
  }

  fallbackSummarize(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length === 0) {
      return text.substring(0, 150) + '...';
    }
    return sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '.' : '');
  }

  // Wrapper to ensure all LanguageModel.create calls have outputLanguage
  async createLanguageModel(options = {}) {
    const defaultOptions = {
      outputLanguage: "en",
      initialPrompts: [{
        role: 'system',
        content: 'You are a helpful assistant.'
      }]
    };

    const mergedOptions = { ...defaultOptions, ...options };
    console.log('Creating LanguageModel with options:', mergedOptions);

    return await LanguageModel.create(mergedOptions);
  }

  async generateNewsWithPromptAPI(sources, newsType, keywords = '') {
    console.log('Using Prompt API to generate news for:', sources, newsType, 'keywords:', keywords);

    // First, try to get real news articles with real URLs
    const realArticles = await this.fetchRealNewsArticles(sources, newsType, keywords);
    if (realArticles.length > 0) {
      console.log(`Found ${realArticles.length} real news articles with actual URLs`);
      return realArticles;
    }

    // Fallback to AI generation with real URLs
    const allArticles = [];

    for (const source of sources) {
      try {
        console.log(`Generating news for ${source} ${newsType} using .prompt() method`);

        // Create or use existing language model
        let languageModel = this.workingLanguageModel;
        if (!languageModel) {
          languageModel = await this.createLanguageModel({
            initialPrompts: [{
              role: 'system',
              content: 'You are a professional news generator. Create realistic, current news articles with proper titles, content, and maintain journalistic standards. Always provide factual, unbiased reporting style.'
            }]
          });
          this.workingLanguageModel = languageModel;
        }

        // Generate multiple articles for this source
        const articleCount = 3; // Generate 3 articles per source

        for (let i = 0; i < articleCount; i++) {
          const prompt = this.createNewsPrompt(source, newsType, i);
          console.log(`Sending prompt to AI for ${source} article ${i + 1}`);

          const aiResponse = await languageModel.prompt(prompt);
          console.log(`Received AI response for ${source} article ${i + 1}`);

          const article = this.parseAINewsResponse(aiResponse, source, newsType, i);
          if (article) {

            allArticles.push(article);
          }
        }

      } catch (error) {
        console.error(`Error generating news for ${source}:`, error);
        console.error(`Skipping ${source} due to generation error`);
      }
    }

    console.log(`Generated ${allArticles.length} total articles using .prompt() method`);
    return allArticles;
  }

  async fetchRealNewsArticles(sources, newsType, keywords = '') {
    console.log('Fetching real news articles from RSS feeds with keywords:', keywords || 'none');
    
    // Send request to background script to fetch real RSS articles
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'fetchRealNews',
        sources,
        newsType,
        keywords
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error fetching real news:', chrome.runtime.lastError);
          resolve([]);
        } else if (response && response.articles) {
          console.log(`Fetched ${response.articles.length} real articles from RSS feeds`);
          resolve(response.articles);
        } else {
          console.log('No real articles found, will use AI generation');
          resolve([]);
        }
      });
    });
  }





  createNewsPrompt(source, newsType, articleIndex) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const sourceStyle = {
      bbc: 'BBC-style professional, international perspective',
      npr: 'NPR-style thoughtful, in-depth analysis',
      nytimes: 'New York Times-style comprehensive, investigative reporting',
      nbcnews: 'NBC News-style breaking news and current affairs',
      foxnews: 'Fox News-style conservative perspective and analysis'
    };

    const newsTopics = {
      us: ['domestic politics', 'federal policy', 'state government', 'US economy', 'American society'],
      world: ['international relations', 'global economy', 'world politics', 'international conflicts', 'global cooperation'],
      tech: ['artificial intelligence', 'technology innovation', 'cybersecurity', 'tech industry', 'digital transformation']
    };

    const topics = newsTopics[newsType] || newsTopics.us;
    const topic = topics[articleIndex % topics.length];

    return `Generate a realistic current news article for ${source.toUpperCase()} about ${topic} in ${newsType} news category.

Requirements:
- Write in ${sourceStyle[source] || 'professional news style'}
- Date context: ${dateStr}
- Format: Return ONLY a JSON object with this exact structure:
{
  "title": "Compelling headline (max 100 characters)",
  "content": "Full article content (200-300 words, professional journalism style)",
  "category": "${newsType}"
}

Topic focus: ${topic}
Style: ${source.toUpperCase()} journalism standards
Make it current, relevant, and realistic for today's news cycle.`;
  }

  parseAINewsResponse(aiResponse, source, newsType, index) {
    try {
      console.log('Parsing AI response:', aiResponse.substring(0, 100) + '...');

      // Try to extract JSON from the response
      let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('No JSON found in response, using fallback parsing');
        return this.parseAIResponseFallback(aiResponse, source, newsType, index);
      }

      let jsonStr = jsonMatch[0];
      
      // Clean up common JSON formatting issues
      jsonStr = jsonStr
        .replace(/,\s*}/g, '}')  // Remove trailing commas
        .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/\n/g, ' ')     // Replace newlines with spaces
        .replace(/\r/g, '')      // Remove carriage returns
        .replace(/\t/g, ' ')     // Replace tabs with spaces
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();

      console.log('Cleaned JSON string:', jsonStr.substring(0, 200) + '...');
      
      const parsed = JSON.parse(jsonStr);

      if (parsed.title && parsed.content) {
        return {
          title: parsed.title,
          content: parsed.content,
          url: this.generateRealNewsUrl(source, parsed.category || newsType, index),
          source: source.toUpperCase(),
          category: newsType,
          timestamp: Date.now() - (index * 1800000),
          generatedByAI: true
        };
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
    }

    // Fallback parsing if JSON parsing fails
    return this.parseAIResponseFallback(aiResponse, source, newsType, index);
  }

  parseAIResponseFallback(aiResponse, source, newsType, index) {
    const lines = aiResponse.split('\n').filter(line => line.trim());

    let title = `${source.toUpperCase()} ${newsType.toUpperCase()} News Update`;
    let content = aiResponse;

    // Try to find a title-like line
    for (const line of lines) {
      if (line.length > 20 && line.length < 150 && !line.includes('{') && !line.includes('}')) {
        title = line.replace(/^["']|["']$/g, '').trim();
        break;
      }
    }

    // Clean up content
    content = aiResponse
      .replace(/^\s*\{[\s\S]*?\}\s*/, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    if (content.length < 50) {
      content = `Current ${newsType} news from ${source.toUpperCase()}. ${content}`;
    }

    return {
      title: title.substring(0, 150),
      content: content.substring(0, 500),
      url: this.generateRealNewsUrl(source, newsType, index),
      source: source.toUpperCase(),
      category: newsType,
      timestamp: Date.now() - (index * 1800000),
      generatedByAI: true
    };
  }




}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new NewsPopup();
});