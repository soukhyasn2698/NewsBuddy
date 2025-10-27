class NewsPopup {
  constructor() {
    console.log('🚀 News Buddy popup-clean.js loaded!');

    this.fetchBtn = document.getElementById('fetchBtn');
    this.btnText = document.getElementById('btnText');
    this.spinner = document.getElementById('spinner');
    this.results = document.getElementById('results');
    this.summaryList = document.getElementById('summaryList');
    this.error = document.getElementById('error');
    this.currentArticles = []; // Store current articles for overall summary
    this.displayedArticles = []; // Store currently displayed articles
    this.articlesPerPage = 5; // Show 5 articles at a time
    this.totalArticlesLoaded = 0; // Track total articles loaded
    this.maxArticles = 10; // Maximum articles allowed (5 + 5)
    this.currentSources = []; // Store current search parameters
    this.currentNewsType = '';
    this.currentKeywords = '';

    console.log('📊 Setup - Max articles:', this.maxArticles);

    this.init();
  }

  init() {
    this.loadUserPreferences();

    // Debug: Check if fetch button exists
    console.log('🔍 Fetch button found:', !!this.fetchBtn);
    if (this.fetchBtn) {
      console.log('✅ Adding click listener to fetch button');
      this.fetchBtn.addEventListener('click', () => {
        console.log('🖱️ Fetch button clicked!');
        this.handleFetch();
      });
    } else {
      console.error('❌ Fetch button not found!');
    }



    // Add clear keywords button
    const clearKeywordsBtn = document.getElementById('clearKeywordsBtn');
    if (clearKeywordsBtn) {
      clearKeywordsBtn.addEventListener('click', () => {
        document.getElementById('keywordInput').value = '';
        console.log('Keywords cleared');
      });
    }

    // Add view more button
    const viewMoreBtn = document.getElementById('viewMoreBtn');
    if (viewMoreBtn) {
      viewMoreBtn.addEventListener('click', () => this.handleViewMore());
    }

    // Check Chrome version on load
    this.checkChromeVersion();

    // DEBUG: Check if all elements exist
    console.log('🔍 Checking DOM elements...');
    console.log('Fetch Button:', !!this.fetchBtn);
    console.log('Button Text:', !!this.btnText);
    console.log('Results:', !!this.results);
    console.log('Summary List:', !!this.summaryList);
    console.log('Error:', !!this.error);
    console.log('View More Container:', !!document.getElementById('viewMoreContainer'));
    console.log('View More Button:', !!document.getElementById('viewMoreBtn'));
    console.log('View More Text:', !!document.getElementById('viewMoreText'));

    // Test button click
    if (this.fetchBtn) {
      console.log('✅ Fetch button ready for clicks');
    }
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
    console.log('🚀 handleFetch called!');
    try {
      console.log('📝 Starting fetch process...');
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

      // Step 1: Fetch all articles first
      if (keywords) {
        console.log('Fetching news with keywords:', keywords);
        this.btnText.textContent = `Finding articles for "${keywords}"...`;
      } else {
        console.log('Fetching general news');
        this.btnText.textContent = 'Finding articles...';
      }

      // Store search parameters for "View More" functionality
      this.currentSources = selectedSources;
      this.currentNewsType = newsType;
      this.currentKeywords = keywords;

      const result = await this.fetchAllArticles(selectedSources, newsType, keywords);

      if (!result.articles || result.articles.length === 0) {
        if (result.message) {
          throw new Error(result.message);
        } else {
          throw new Error('No articles found');
        }
      }

      // Reset counters
      this.displayedArticles = [];
      this.totalArticlesLoaded = 0;

      console.log('📄 Fetched first batch:', result.articles.length, 'articles');

      // Step 2: Summarize the first 5 articles
      this.btnText.textContent = `Summarizing ${result.articles.length} articles...`;
      console.log(`Summarizing first ${result.articles.length} articles...`);

      const summaries = await this.summarizeAllArticles(result.articles);
      this.displayedArticles = summaries;
      this.totalArticlesLoaded = summaries.length;

      console.log('✅ Initial batch ready:', this.displayedArticles.length, 'articles displayed');

      this.displayResults(summaries, keywords, result.dateRange, this.totalArticlesLoaded);

    } catch (error) {
      this.showError(error.message);
    } finally {
      this.showLoading(false);
    }
  }

  async fetchAllArticles(sources, newsType, keywords = '') {
    return new Promise((resolve, reject) => {
      console.log('Fetching articles from background script:', { sources, newsType, keywords });

      chrome.runtime.sendMessage({
        action: 'fetchArticlesOnly',
        sources,
        newsType,
        keywords
      }, async (response) => {
        console.log('Received articles response:', response);

        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          console.error('Response error:', response.error);
          reject(new Error(response.error));
        } else if (response && (response.articles || response.message)) {
          if (response.articles && response.articles.length === 0 && response.message) {
            reject(new Error(response.message));
            return;
          }
          console.log('Got articles from background:', response.articles?.length || 0);

          resolve({
            articles: response.articles,
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

  async summarizeAllArticles(articles) {
    return new Promise((resolve, reject) => {
      console.log('Sending articles for summarization:', articles.length);

      chrome.runtime.sendMessage({
        action: 'summarizeArticles',
        articles: articles
      }, async (response) => {
        console.log('Received summaries response:', response);

        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          console.error('Response error:', response.error);
          reject(new Error(response.error));
        } else if (response && response.summaries) {
          console.log('Got summaries from background:', response.summaries.length);
          resolve(response.summaries);
        } else {
          console.error('Invalid response format:', response);
          reject(new Error('Invalid response from background script'));
        }
      });
    });
  }

  async fetchMoreArticles(sources, newsType, keywords = '') {
    return new Promise((resolve, reject) => {
      // Get URLs of already displayed articles to exclude them
      const excludeUrls = this.displayedArticles.map(article => article.url);
      console.log('Fetching MORE articles from background script:', { sources, newsType, keywords, excludeUrls: excludeUrls.length });

      chrome.runtime.sendMessage({
        action: 'fetchMoreArticles',
        sources,
        newsType,
        keywords,
        excludeUrls
      }, async (response) => {
        console.log('Received MORE articles response:', response);

        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          console.error('Response error:', response.error);
          reject(new Error(response.error));
        } else if (response && (response.articles || response.message)) {
          if (response.articles && response.articles.length === 0 && response.message) {
            reject(new Error(response.message));
            return;
          }
          console.log('Got MORE articles from background:', response.articles?.length || 0);

          resolve({
            articles: response.articles,
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

  async handleViewMore() {
    try {
      const viewMoreBtn = document.getElementById('viewMoreBtn');
      const viewMoreText = document.getElementById('viewMoreText');
      const viewMoreSpinner = document.getElementById('viewMoreSpinner');

      // Show loading state
      viewMoreBtn.disabled = true;
      viewMoreText.textContent = 'Fetching more articles...';
      viewMoreSpinner.classList.remove('hidden');

      console.log('🔄 Fetching 5 more articles...');
      console.log('📋 Currently displayed articles:', this.displayedArticles.length);
      console.log('🔗 URLs to exclude:', this.displayedArticles.map(a => a.url));

      // Fetch 5 more articles from the server
      const result = await this.fetchMoreArticles(this.currentSources, this.currentNewsType, this.currentKeywords);

      if (!result.articles || result.articles.length === 0) {
        throw new Error('No more articles available');
      }

      console.log(`📰 Got ${result.articles.length} more articles`);

      // Update loading text
      viewMoreText.textContent = `Summarizing ${result.articles.length} more articles...`;

      // Summarize the new batch
      const summaries = await this.summarizeAllArticles(result.articles);

      // Add to displayed articles
      this.displayedArticles = [...this.displayedArticles, ...summaries];
      this.totalArticlesLoaded += summaries.length;

      console.log(`✅ Total articles now: ${this.totalArticlesLoaded}`);

      // Update the display
      this.appendArticlesToDisplay(summaries);

      // Update view more button visibility (hide it since we've reached max 10)
      this.updateViewMoreButton();

      // Regenerate AI summary with all displayed articles
      await this.generateOverallSummaryAutomatically();

    } catch (error) {
      console.error('Error loading more articles:', error);
      this.showError(error.message);
    } finally {
      // Reset button state
      const btn = document.getElementById('viewMoreBtn');
      const text = document.getElementById('viewMoreText');
      const spinner = document.getElementById('viewMoreSpinner');

      if (btn) btn.disabled = false;
      if (text) text.textContent = 'View More Articles';
      if (spinner) spinner.classList.add('hidden');
    }
  }

  displayResults(summaries, keywords = '', dateRange = '24 hours', totalAvailable = 0) {
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

    const showingCount = this.totalArticlesLoaded;
    const maxPossible = this.maxArticles;

    let statusText = `📅 <strong>Latest News:</strong> Past ${dateRange} • Showing ${showingCount} articles (max ${maxPossible})`;

    if (searchKeywords) {
      const expandedNote = isExpanded ? ' (expanded search)' : '';
      statusText = `🔍 <strong>Search Results:</strong> "${searchKeywords}" (Past ${dateRange}${expandedNote}) • Showing ${showingCount} articles (max ${maxPossible})`;

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
      item.style.cssText = 'background: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 8px; border-left: 3px solid #1a73e8;';

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

      // Old unused code removed - we only show hyperlinks with time and source

      // Add hyperlink and meta info
      item.appendChild(titleLink);

      // Add time and source information
      const metaInfo = document.createElement('div');
      metaInfo.className = 'article-meta';
      const timeText = summary.timeAgo || 'Recent';
      const sourceText = summary.source || 'Unknown';
      metaInfo.textContent = `${timeText} • ${sourceText}`;
      metaInfo.style.cssText = 'font-size: 11px; color: #999; margin-top: 4px; font-style: italic;';
      item.appendChild(metaInfo);

      this.summaryList.appendChild(item);
    });

    // Store articles for overall summary
    this.currentArticles = summaries;

    // Update view more button visibility
    this.updateViewMoreButton();



    this.showResults();

    // Automatically generate overall summary for any number of articles
    if (summaries.length >= 1) {
      this.generateOverallSummaryAutomatically();
    }


  }

  appendArticlesToDisplay(summaries) {
    summaries.forEach((summary, index) => {
      console.log(`=== APPENDING SUMMARY ${index} DEBUG ===`);
      console.log('Summary object:', summary);

      const item = document.createElement('div');
      item.className = 'summary-item';
      item.style.cssText = 'background: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 8px; border-left: 3px solid #1a73e8;';

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

      // Add hyperlink and meta info
      item.appendChild(titleLink);

      // Add time and source information
      const metaInfo = document.createElement('div');
      metaInfo.className = 'article-meta';
      const timeText = summary.timeAgo || 'Recent';
      const sourceText = summary.source || 'Unknown';
      metaInfo.textContent = `${timeText} • ${sourceText}`;
      metaInfo.style.cssText = 'font-size: 11px; color: #999; margin-top: 4px; font-style: italic;';
      item.appendChild(metaInfo);

      this.summaryList.appendChild(item);
    });

    // Update the status header
    this.updateStatusHeader();
  }

  updateViewMoreButton() {
    console.log('🔄 Updating View More button...');

    const viewMoreContainer = document.getElementById('viewMoreContainer');
    const viewMoreBtn = document.getElementById('viewMoreBtn');
    const viewMoreText = document.getElementById('viewMoreText');

    if (!viewMoreContainer || !viewMoreBtn || !viewMoreText) {
      console.log('❌ View More elements not found!');
      return;
    }

    const canLoadMore = this.totalArticlesLoaded < this.maxArticles && this.totalArticlesLoaded === 5;

    console.log(`📊 Articles loaded: ${this.totalArticlesLoaded}/${this.maxArticles}, Can load more: ${canLoadMore}`);

    if (canLoadMore) {
      viewMoreText.textContent = 'View 5 More Articles';
      viewMoreContainer.style.display = 'block';
      console.log('✅ View More button shown - can fetch 5 more articles');
    } else {
      viewMoreContainer.style.display = 'none';
      if (this.totalArticlesLoaded >= this.maxArticles) {
        console.log('❌ View More button hidden - reached maximum 10 articles');
      } else {
        console.log('❌ View More button hidden - not enough articles loaded yet');
      }
    }
  }

  updateStatusHeader() {
    const statusHeader = this.summaryList.querySelector('div[style*="background"]');
    if (!statusHeader) return;

    const showingCount = this.displayedArticles.length;
    const totalCount = this.allAvailableArticles.length;
    const keywords = document.getElementById('keywordInput').value.trim();

    let statusText = `📅 <strong>Latest News:</strong> Showing ${showingCount} of ${totalCount} articles`;

    if (keywords) {
      statusText = `🔍 <strong>Search Results:</strong> "${keywords}" • Showing ${showingCount} of ${totalCount} matching articles`;
    }

    statusHeader.innerHTML = statusText;
  }



  async generateOverallSummaryAutomatically() {
    const summaryLoadingState = document.getElementById('summaryLoadingState');
    const overallSummaryContent = document.getElementById('overallSummaryContent');

    try {
      // Show loading state
      if (summaryLoadingState) summaryLoadingState.style.display = 'flex';
      if (overallSummaryContent) overallSummaryContent.style.display = 'none';

      console.log('Auto-generating summary for', this.displayedArticles.length, 'articles using Enhanced Summarizer API');

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
      sharedContext: this.displayedArticles.length === 1
        ? "This is a news article from a major news source (BBC, NPR, New York Times, NBC News, or Fox News). The user expects a detailed analysis of the key points, main facts, and important developments from this article."
        : "These are news articles from various sources including BBC, NPR, New York Times, NBC News, and Fox News. The user expects a concise summary highlighting the main points and key developments from each article."
    });

    console.log('✅ Enhanced summarizer created successfully');

    // Prepare content for summarization
    const articlesText = this.prepareContentForSummarization();
    console.log(`📄 Content prepared: ${articlesText.length} characters from ${this.displayedArticles.length} articles`);

    // Generate summary with context
    console.log('🔄 Generating enhanced summary...');
    const summary = await summarizer.summarize(articlesText, {
      context: `This summary is for a news reader who wants to quickly understand the main developments across ${this.displayedArticles.length} articles from multiple news sources.`
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
    const articlesText = this.displayedArticles.map((article, index) => {
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
    const fullContentCount = this.displayedArticles.filter(a => a.hasFullContent).length;
    const isSingleArticle = this.displayedArticles.length === 1;

    const contextHeader = isSingleArticle
      ? `News Analysis Request:
Please analyze this news article and extract the key points, main facts, and important details in bullet format (${fullContentCount > 0 ? 'with full content analysis' : 'from RSS summary'}):

`
      : `News Summary Request:
Please create a comprehensive summary of these ${this.displayedArticles.length} news articles (${fullContentCount} with full content analysis):

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
    const fullContentCount = this.displayedArticles.filter(a => a.hasFullContent).length;
    const totalCount = this.displayedArticles.length;
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
      this.btnText.textContent = 'Get My News';
      this.spinner.classList.add('hidden');
    }
  }

  showResults() {
    this.results.classList.remove('hidden');
  }

  hideResults() {
    this.results.classList.add('hidden');
    this.resetSummaryState();
    this.resetPaginationState();
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

  resetPaginationState() {
    this.allAvailableArticles = [];
    this.displayedArticles = [];
    this.currentPage = 0;

    const viewMoreContainer = document.getElementById('viewMoreContainer');
    if (viewMoreContainer) {
      viewMoreContainer.style.display = 'none';
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

      if (version < 127) {
        console.warn('Chrome version too old for Enhanced Summarizer API:', version);
      }
    }
  }


}

// Initialize popup when DOM is loaded
// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 DOM loaded, initializing News Buddy...');
  new NewsPopup();
});