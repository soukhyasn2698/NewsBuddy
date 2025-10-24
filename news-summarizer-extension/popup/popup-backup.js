class NewsPopup {
  constructor() {
    this.fetchBtn = document.getElementById('fetchBtn');
    this.btnText = document.getElementById('btnText');
    this.spinner = document.getElementById('spinner');
    this.results = document.getElementById('results');
    this.summaryList = document.getElementById('summaryList');
    this.error = document.getElementById('error');
    this.currentArticles = []; // Store current articles for overall summary

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

    // Overall summary is now generated automatically - no manual button needed
  }

  async loadUserPreferences() {
    try {
      const data = await chrome.storage.sync.get(['selectedSources']);

      if (data.selectedSources) {
        data.selectedSources.forEach(source => {
          const checkbox = document.getElementById(source);
          if (checkbox) checkbox.checked = true;
        });
      }

      // News type is no longer used - using general news feeds
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }

  async saveUserPreferences() {
    const selectedSources = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value);
    // News type is no longer used - using general news feeds

    await chrome.storage.sync.set({
      selectedSources
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
      const newsType = 'general'; // Default to general news since news type selection is removed
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

          // Use articles from background script directly
          resolve({
            summaries: response.summaries,
            dateRange: response.dateRange || '24 hours',
            keywordSearch: response.keywordSearch || false
          });
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

      // Create category and time info with content analysis indicator
      const metaInfo = document.createElement('div');
      metaInfo.className = 'summary-meta';
      metaInfo.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;';

      const categoryText = summary.category || 'News';
      const timeText = summary.timeAgo || 'Recent';

      // Add content analysis badge
      let contentBadge = '';
      if (summary.hasFullContent) {
        contentBadge = '<span style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: bold;">📄 DEEP ANALYSIS</span>';
      } else {
        contentBadge = '<span style="background: #FF9800; color: white; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: bold;">📰 RSS SUMMARY</span>';
      }

      metaInfo.innerHTML = `${categoryText} • ${timeText} ${contentBadge}`;

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

    // Store articles for overall summary
    this.currentArticles = summaries;

    // Sync articles to dashboard
    this.syncToDashboard(summaries);

    this.showResults();

    // Automatically generate overall summary for any number of articles
    if (summaries.length >= 1) {
      this.generateOverallSummaryAutomatically();
    }
  }

  async syncToDashboard(summaries) {
    try {
      // Add category information - using general since news type selection is removed
      const newsType = 'general';
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

  async generateOverallSummary() {
    if (!this.currentArticles || this.currentArticles.length === 0) {
      this.showError('No articles available to summarize');
      return;
    }

    const summaryBtn = document.getElementById('generateOverallSummaryBtn');
    const summaryBtnText = document.getElementById('summaryBtnText');
    const summarySpinner = document.getElementById('summarySpinner');
    const overallSummary = document.getElementById('overallSummary');
    const overallSummaryContent = document.getElementById('overallSummaryContent');

    try {
      // Show loading state
      summaryBtn.disabled = true;
      summaryBtnText.textContent = 'Generating Summary...';
      summarySpinner.classList.remove('hidden');
      overallSummary.style.display = 'none';

      console.log('Generating overall summary for', this.currentArticles.length, 'articles');

      // Use only Enhanced Summarizer API
      await this.generateSummaryWithEnhancedSummarizer();

    } catch (error) {
      console.error('Error generating overall summary:', error);
      this.showError('Failed to generate overall summary. Please try again.');
    } finally {
      // Reset button state
      summaryBtn.disabled = false;
      summaryBtnText.textContent = '📝 Generate Overall Summary';
      summarySpinner.classList.add('hidden');
    }
  }

  async generateSummaryWithEnhancedSummarizer() {
    try {
      console.log('🤖 Using Enhanced Chrome Summarizer API...');

      // Check if Enhanced Summarizer API is available
      if (typeof Summarizer === 'undefined') {
        throw new Error('Enhanced Summarizer API not available');
      }

      console.log('✅ Enhanced Summarizer API found');
      await this.useEnhancedSummarizerAPI();

    } catch (error) {
      console.error('Enhanced Summarizer failed:', error);
      this.showError('Enhanced Summarizer API not available. Please ensure you have Chrome 127+ with AI features enabled.');
    }
  }



  displayOverallSummary(summaryText) {
    const overallSummaryContent = document.getElementById('overallSummaryContent');

    // Add analysis depth indicator
    const fullContentCount = this.currentArticles.filter(a => a.hasFullContent).length;
    const totalCount = this.currentArticles.length;
    const isSingleArticle = totalCount === 1;

    let analysisIndicator = '';
    if (fullContentCount > 0) {
      const percentage = Math.round((fullContentCount / totalCount) * 100);
      if (isSingleArticle) {
        analysisIndicator = `<div style="background: #e8f5e8; border: 1px solid #4CAF50; border-radius: 6px; padding: 8px; margin-bottom: 12px; font-size: 11px;">
          <strong>🔍 Article Analysis:</strong> Deep content analysis performed (full article content extracted and analyzed)
        </div>`;
      } else {
        analysisIndicator = `<div style="background: #e8f5e8; border: 1px solid #4CAF50; border-radius: 6px; padding: 8px; margin-bottom: 12px; font-size: 11px;">
          <strong>📊 Analysis Depth:</strong> ${fullContentCount}/${totalCount} articles analyzed with full content (${percentage}% deep analysis)
        </div>`;
      }
    } else {
      if (isSingleArticle) {
        analysisIndicator = `<div style="background: #fff3e0; border: 1px solid #FF9800; border-radius: 6px; padding: 8px; margin-bottom: 12px; font-size: 11px;">
          <strong>📰 Article Analysis:</strong> Key points extracted from RSS summary (full content extraction unavailable)
        </div>`;
      } else {
        analysisIndicator = `<div style="background: #fff3e0; border: 1px solid #FF9800; border-radius: 6px; padding: 8px; margin-bottom: 12px; font-size: 11px;">
          <strong>📰 Analysis Depth:</strong> Summary based on RSS feeds only (full content extraction unavailable)
        </div>`;
      }
    }

    // Convert markdown-style formatting to HTML
    let htmlSummary = summaryText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
      .replace(/^\* (.*$)/gim, '<li>$1</li>') // Bullet points with *
      .replace(/^• (.*$)/gim, '<li>$1</li>') // Bullet points with •
      .replace(/^- (.*$)/gim, '<li>$1</li>') // Bullet points with -
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>') // Numbered lists
      .replace(/\n\n/g, '</p><p>') // Paragraphs
      .replace(/\n/g, '<br>'); // Line breaks

    // Wrap in paragraphs if not already formatted
    if (!htmlSummary.includes('<li>') && !htmlSummary.includes('<p>')) {
      htmlSummary = `<p>${htmlSummary}</p>`;
    }

    // Wrap list items in ul tags
    if (htmlSummary.includes('<li>')) {
      htmlSummary = htmlSummary.replace(/(<li>.*?<\/li>)/gs, (match) => {
        if (!match.includes('<ul>')) {
          return `<ul>${match}</ul>`;
        }
        return match;
      });
    }

    if (overallSummaryContent) {
      overallSummaryContent.innerHTML = analysisIndicator + htmlSummary;
      overallSummaryContent.style.display = 'block';
    }

    console.log('Overall summary displayed with analysis depth indicator');
  }

  // Enhanced Summarizer API - Automatic Generation
  async generateSummaryWithEnhancedSummarizerAuto() {
    try {
      console.log('🤖 Using Enhanced Chrome Summarizer API for automatic generation...');

      // Check if Enhanced Summarizer API is available
      if (typeof Summarizer === 'undefined') {
        throw new Error('Enhanced Summarizer API not available');
      }

      console.log('✅ Enhanced Summarizer API found');
      await this.useEnhancedSummarizerAPI();

    } catch (error) {
      console.error('❌ Enhanced Summarizer API failed:', error);
      throw error; // Re-throw to be handled by the caller
    }
  }

  // Use the enhanced Summarizer.create() API with advanced options
  async useEnhancedSummarizerAPI() {
    console.log('🚀 Using Enhanced Summarizer API...');

    // Create summarizer with enhanced configuration
    const summarizer = await Summarizer.create({
      type: "key-points",                    // Extract key points from news articles
      expectedInputLanguages: ["en"],       // Expect English input
      outputLanguage: "en",                  // Output in English
      expectedContextLanguages: ["en"],     // Context in English
      sharedContext: this.currentArticles.length === 1
        ? "This is a news article from a major news source (BBC, NPR, New York Times, NBC News, or Fox News). The user expects a detailed analysis of the key points, main facts, and important developments from this article."
        : "These are news articles from various sources including BBC, NPR, New York Times, NBC News, and Fox News. The user expects a concise summary highlighting the main points and key developments from each article."
    });

    console.log('✅ Enhanced summarizer created successfully');

    // Prepare content for summarization
    const articlesText = this.prepareContentForSummarization();
    console.log(`📄 Content prepared: ${articlesText.length} characters from ${this.currentArticles.length} articles`);

    // Generate summary with context
    console.log('🔄 Generating enhanced summary...');
    const summary = await summarizer.summarize(articlesText, {
      context: `This summary is for a news reader who wants to quickly understand the main developments across ${this.currentArticles.length} articles from multiple news sources.`
    });

    console.log('✅ Enhanced summary generated successfully');
    console.log('📋 Summary preview:', summary.substring(0, 100) + '...');

    // Clean up
    summarizer.destroy();
    console.log('🧹 Enhanced summarizer session cleaned up');

    // Display results
    this.displayOverallSummary(summary);
    this.showMethodBadge('enhanced-summarizer');
  }



  // Prepare content for summarization following best practices
  prepareContentForSummarization() {
    // Combine articles with proper structure for better summarization
    const articlesText = this.currentArticles.map((article, index) => {
      // Use full content if available, otherwise use summary
      const contentToUse = article.hasFullContent && article.content ?
        article.content.substring(0, 1000) : // Limit full content to 1000 chars per article
        article.summary;

      const contentType = article.hasFullContent ? 'Full Article Content' : 'RSS Summary';

      return `Article ${index + 1} from ${article.source} (${contentType}):
Title: ${article.title}
Content: ${contentToUse}
---`;
    }).join('\n\n');

    // Add context header for better summarization
    const fullContentCount = this.currentArticles.filter(a => a.hasFullContent).length;
    const isSingleArticle = this.currentArticles.length === 1;

    const contextHeader = isSingleArticle
      ? `News Analysis Request:
Please analyze this news article and extract the key points, main facts, and important details in bullet format (${fullContentCount > 0 ? 'with full content analysis' : 'from RSS summary'}):

`
      : `News Summary Request:
Please create a comprehensive summary of these ${this.currentArticles.length} news articles (${fullContentCount} with full content analysis):

`;

    const fullText = contextHeader + articlesText;

    // Ensure we don't exceed reasonable limits (Chrome Summarizer works best with reasonable input sizes)
    const maxLength = 8000; // Conservative limit
    if (fullText.length > maxLength) {
      console.log(`⚠️ Content too long (${fullText.length} chars), truncating to ${maxLength} chars`);
      return fullText.substring(0, maxLength) + '\n\n[Content truncated for processing]';
    }

    return fullText;
  }



  showSummaryDownloading() {
    const overallSummaryContent = document.getElementById('overallSummaryContent');
    if (overallSummaryContent) {
      overallSummaryContent.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #666; background: #f0f8ff; border-radius: 6px; border: 1px solid #1a73e8;">
          <div class="summary-spinner" style="margin: 0 auto 12px;"></div>
          <p><strong>📥 Downloading Chrome AI Model</strong></p>
          <p style="font-size: 11px; margin-top: 8px;">The Chrome Summarizer API is downloading the AI model.<br>This happens once per browser session.</p>
          <p style="font-size: 10px; color: #999; margin-top: 8px;">Please wait and try again in a moment...</p>
        </div>
      `;
      overallSummaryContent.style.display = 'block';
    }
  }

  // Enhanced summarizer configuration based on Chrome documentation
  getSummarizerConfig() {
    return {
      type: 'key-points',        // Options: 'tl;dr', 'key-points', 'teaser', 'headline'
      format: 'markdown',        // Options: 'markdown', 'plain-text'
      length: 'medium'           // Options: 'short', 'medium', 'long'
    };
  }

  // Test function to verify Chrome Summarizer API
  async testSummarizerAPI() {
    console.log('🧪 Testing Chrome Summarizer API...');

    try {
      const support = await this.checkSummarizerSupport();
      console.log('📊 Support check result:', support);

      if (!support.supported && !support.needsDownload) {
        console.log('❌ Summarizer not supported:', support.reason);
        return false;
      }

      if (support.needsDownload) {
        console.log('⏳ Model needs download, cannot test now');
        return false;
      }

      // Test with a simple text
      const testText = "This is a test article about artificial intelligence. AI is transforming many industries. Machine learning algorithms are becoming more sophisticated.";

      const summarizer = await window.ai.summarizer.create(this.getSummarizerConfig());
      const testSummary = await summarizer.summarize(testText);
      summarizer.destroy();

      console.log('✅ Summarizer API test successful!');
      console.log('📝 Test summary:', testSummary);
      return true;

    } catch (error) {
      console.error('❌ Summarizer API test failed:', error);
      return false;
    }
  }

  // Check if Chrome Summarizer API is properly supported
  async checkSummarizerSupport() {
    try {
      // Check for enhanced Summarizer API first
      if (typeof Summarizer !== 'undefined') {
        console.log('🚀 Enhanced Summarizer API detected');
        return {
          supported: true,
          enhanced: true,
          reason: 'Enhanced Summarizer API available'
        };
      }

      // Check standard API
      if (!window.ai || !window.ai.summarizer) {
        return {
          supported: false,
          reason: 'Chrome Summarizer API not available. Please ensure you are using Chrome 127+ with AI features enabled.'
        };
      }

      const capabilities = await window.ai.summarizer.capabilities();

      return {
        supported: capabilities.available === 'readily',
        needsDownload: capabilities.available === 'after-download',
        notSupported: capabilities.available === 'no',
        enhanced: false,
        capabilities: capabilities
      };
    } catch (error) {
      return {
        supported: false,
        reason: `Error checking summarizer support: ${error.message}`
      };
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

    // Reset summary state
    this.resetSummaryState();
  }

  resetSummaryState() {
    const summaryLoadingState = document.getElementById('summaryLoadingState');
    const overallSummaryContent = document.getElementById('overallSummaryContent');

    if (summaryLoadingState) summaryLoadingState.style.display = 'none';
    if (overallSummaryContent) {
      overallSummaryContent.innerHTML = '';
      overallSummaryContent.style.display = 'none';
    }

    // Hide method badge when resetting
    this.hideMethodBadge();
  }



  async generateOverallSummaryAutomatically() {
    const summaryLoadingState = document.getElementById('summaryLoadingState');
    const overallSummaryContent = document.getElementById('overallSummaryContent');

    try {
      // Show loading state
      if (summaryLoadingState) summaryLoadingState.style.display = 'flex';
      if (overallSummaryContent) overallSummaryContent.style.display = 'none';

      console.log('Auto-generating summary for', this.currentArticles.length, 'articles using Enhanced Summarizer API');

      // Use only Enhanced Summarizer API
      await this.generateSummaryWithEnhancedSummarizerAuto();

    } catch (error) {
      console.error('Error generating automatic summary:', error);
      this.showSummaryError('Enhanced Summarizer API failed. Please ensure you have Chrome 127+ with AI features enabled.');
    } finally {
      // Hide loading state
      if (summaryLoadingState) summaryLoadingState.style.display = 'none';
    }
  }

  showSummaryError(message) {
    const overallSummaryContent = document.getElementById('overallSummaryContent');
    if (overallSummaryContent) {
      overallSummaryContent.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #d63031; background: #fef7f0; border-radius: 6px; border: 1px solid #f9c74f;">
          <p>⚠️ ${message}</p>
        </div>
      `;
      overallSummaryContent.style.display = 'block';
    }

    // Show error badge
    this.showMethodBadge('error', '❌ Error');
  }

  // Show Enhanced Summarizer method badge
  showMethodBadge(method, customText = null) {
    const badge = document.getElementById('summaryMethodBadge');
    if (!badge) return;

    const badges = {
      'enhanced-summarizer': {
        class: 'gemini-nano',
        text: customText || '🚀 Enhanced Summarizer',
        title: 'Using Chrome Enhanced Summarizer API'
      },
      'error': {
        class: 'fallback',
        text: customText || '❌ Error',
        title: 'Enhanced Summarizer failed'
      }
    };

    const badgeInfo = badges[method] || badges['enhanced-summarizer'];

    badge.className = `method-badge ${badgeInfo.class}`;
    badge.textContent = badgeInfo.text;
    badge.title = badgeInfo.title;
    badge.style.display = 'block';

    console.log(`🏷️ Showing method badge: ${badgeInfo.text}`);
  }

  // Hide the method badge
  hideMethodBadge() {
    const badge = document.getElementById('summaryMethodBadge');
    if (badge) {
      badge.style.display = 'none';
    }
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
}
    console.log('Using Prompt API to generate news for:', sources, 'keywords:', keywords);

    // First, try to get real news articles with real URLs
    const realArticles = await this.fetchRealNewsArticles(sources, keywords);
    if (realArticles.length > 0) {
      console.log(`Found ${realArticles.length} real news articles with actual URLs`);
      return realArticles;
    }

    // Fallback to AI generation with real URLs
    const allArticles = [];

    for (const source of sources) {
      try {
        console.log(`Generating general news for ${source} using .prompt() method`);

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
          const prompt = this.createNewsPrompt(source, keywords, i);
          console.log(`Sending prompt to AI for ${source} article ${i + 1}`);

          const aiResponse = await languageModel.prompt(prompt);
          console.log(`Received AI response for ${source} article ${i + 1}`);

          const article = this.parseAINewsResponse(aiResponse, source, i);
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

  async fetchRealNewsArticles(sources, keywords = '') {
    console.log('Fetching real news articles from RSS feeds with keywords:', keywords || 'none');

    // Send request to background script to fetch real RSS articles
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'fetchRealNews',
        sources,
        newsType: 'general', // Default to general since news types are removed
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





  createNewsPrompt(source, keywords, articleIndex) {
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

    // General news topics covering all major areas
    const generalTopics = [
      'breaking news', 'politics', 'international affairs', 'economy', 'business',
      'technology', 'health', 'environment', 'social issues', 'culture',
      'education', 'science', 'sports', 'entertainment', 'local news'
    ];

    // Use keywords if provided, otherwise use general topics
    //     let topicFocus;
    //     if (keywords && keywords.trim()) {
    //       topicFocus = `news related to: ${keywords}`;
    //     } else {
    //       const topic = generalTopics[articleIndex % generalTopics.length];
    //       topicFocus = `current ${topic} news`;
    //     }

    //     const keywordInstruction = keywords && keywords.trim()
    //       ? `Focus specifically on stories related to: "${keywords}". Ensure the article is relevant to these keywords.`
    //       : 'Cover current general news topics from today\'s news cycle.';

    //     return `Generate a realistic current news article for ${source.toUpperCase()} covering ${topicFocus}.

    // Requirements:
    // - Write in ${sourceStyle[source] || 'professional news style'}
    // - Date context: ${dateStr}
    // - ${keywordInstruction}
    // - Format: Return ONLY a JSON object with this exact structure:
    // {
    //   "title": "Compelling headline (max 100 characters)",
    //   "content": "Full article content (200-300 words, professional journalism style)"
    // }

    // Topic focus: ${topicFocus}
    // Style: ${source.toUpperCase()} journalism standards
    // Make it current, relevant, and realistic for today's news cycle.`;
    //   }

    let topicFocus;
    if (keywords && keywords.trim()) {
      // Focus on specific keyword-related news
      topicFocus = `current news containing keywords: "${keywords}"`;
    } else {
      const topic = generalTopics[articleIndex % generalTopics.length];
      topicFocus = `current ${topic} news`;
    }

    // Enhanced keyword instruction for clarity and precision
    const keywordInstruction = keywords && keywords.trim()
      ? `Only generate articles that explicitly relate to "${keywords}" — 
     include recent developments, major figures, and significant U.S. events 
     that match these keywords in the past 24 hours.`
      : 'Generate a relevant article from today’s top U.S. news cycle across diverse topics.';

    // Final prompt structure
    return `Generate a realistic current news article for ${source.toUpperCase()} focused on ${topicFocus}.

Requirements:
- Write in ${sourceStyle[source] || 'fact-checked, analytical, and balanced news style'}
- Date context: ${dateStr}
- ${keywordInstruction}
- Maintain verified factual tone and balance consistent with ${source.toUpperCase()} standards.
- Article should reference authentic, timely U.S. developments related to these keywords when supplied.

Format: Return ONLY a JSON object with the exact structure below:
{
  "title": "Compelling headline (max 100 characters)",
  "content": "Full article content (200–300 words, professional journalism style, realistic for the current U.S. news cycle)",
  
}

Topic focus: ${topicFocus}
Ensure relevance: If keywords are provided, the story must use those keywords as its central focus.`;
  }
  parseAINewsResponse(aiResponse, source, index) {
    try {
      console.log('Parsing AI response:', aiResponse.substring(0, 100) + '...');

      // Try to extract JSON from the response
      let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('No JSON found in response, using fallback parsing');
        return this.parseAIResponseFallback(aiResponse, source, index);
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
          url: this.generateRealNewsUrl(source, 'general', index),
          source: source.toUpperCase(),
          category: 'general',
          timestamp: Date.now() - (index * 1800000),
          generatedByAI: true
        };
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
    }

    // Fallback parsing if JSON parsing fails
    return this.parseAIResponseFallback(aiResponse, source, index);
  }

  parseAIResponseFallback(aiResponse, source, index) {
    const lines = aiResponse.split('\n').filter(line => line.trim());

    let title = `${source.toUpperCase()} News Update`;
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
      content = `Current news from ${source.toUpperCase()}. ${content}`;
    }

    return {
      title: title.substring(0, 150),
      content: content.substring(0, 500),
      url: this.generateRealNewsUrl(source, 'general', index),
      source: source.toUpperCase(),
      category: 'general',
      timestamp: Date.now() - (index * 1800000),
      generatedByAI: true
    };
  }




  // Quick method to check what summarization method will be used
  async checkCurrentSummarizationMethod() {
    console.log('🔍 CHECKING AVAILABLE SUMMARIZATION METHODS:');

    const support = await this.checkSummarizerSupport();

    if (support.supported) {
      console.log('✅ PRIMARY: Chrome Summarizer API (Gemini Nano) - AVAILABLE');
      return 'gemini-nano';
    } else if (support.needsDownload) {
      console.log('⏳ PRIMARY: Chrome Summarizer API (Gemini Nano) - NEEDS DOWNLOAD');
      return 'downloading';
    } else {
      console.log('❌ PRIMARY: Chrome Summarizer API - NOT AVAILABLE');
      console.log('   Reason:', support.reason);
    }

    if (typeof LanguageModel !== 'undefined' || this.workingLanguageModel) {
      console.log('✅ SECONDARY: Language Model API - AVAILABLE');
      return 'language-model';
    } else {
      console.log('❌ SECONDARY: Language Model API - NOT AVAILABLE');
    }

    console.log('📝 FALLBACK: Simple Text Processing - WILL BE USED');
    return 'fallback';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new NewsPopup();
});
// Ini
tialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new NewsPopup();
});