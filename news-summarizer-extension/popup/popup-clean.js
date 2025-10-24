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

    // Check Chrome version on load
    this.checkChromeVersion();
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
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }

  async saveUserPreferences() {
    const selectedSources = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value);

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
      const newsType = 'general';
      const keywords = document.getElementById('keywordInput').value.trim();

      if (selectedSources.length === 0) {
        throw new Error('Please select at least one news source');
      }

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
          if (response.summaries && response.summaries.length === 0 && response.message) {
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

    const searchKeywords = keywords || document.getElementById('keywordInput').value.trim();

    if (!summaries || summaries.length === 0) {
      if (searchKeywords) {
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
      titleLink.href = summary.url;
      titleLink.className = 'summary-title';
      titleLink.textContent = summary.title + ' ↗';
      titleLink.title = 'Click to open article in new tab';
      titleLink.target = '_blank';
      titleLink.addEventListener('click', (e) => {
        console.log('=== LINK CLICK DEBUG ===');
        console.log('Link clicked:', summary.title);
        console.log('URL to open:', summary.url);

        let urlToOpen = summary.url;
        if (!urlToOpen || !urlToOpen.startsWith('http')) {
          console.warn('Invalid URL, skipping article');
          this.showError('Invalid article URL');
          e.preventDefault();
          return;
        }

        if (e.ctrlKey || e.metaKey || e.button === 1) {
          console.log('User modifier detected, allowing default behavior');
          return;
        }

        e.preventDefault();

        titleLink.style.color = '#666';
        titleLink.textContent = summary.title + ' ⏳ Opening...';

        console.log('Opening URL with Chrome tabs API...');

        if (chrome && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: urlToOpen }, (tab) => {
            if (chrome.runtime.lastError) {
              console.error('Chrome tabs failed:', chrome.runtime.lastError.message);
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

    this.hideMethodBadge();
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

      if (version < 127) {
        console.warn('Chrome version too old for Enhanced Summarizer API:', version);
      }
    }
  }

  openDashboard() {
    const dashboardUrl = 'http://localhost:8080';

    chrome.tabs.create({ url: dashboardUrl }, (tab) => {
      if (chrome.runtime.lastError) {
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

    const fileUrl = window.location.protocol === 'file:' ?
      '../news-dashboard/index.html' :
      'news-dashboard/index.html';

    chrome.tabs.create({ url: fileUrl });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new NewsPopup();
});