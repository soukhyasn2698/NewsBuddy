class NewsBackground {
  constructor() {
    this.init();
  }

  init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'fetchNews') {
        this.handleFetchNews(request, sendResponse);
        return true; // Keep message channel open for async response
      } else if (request.action === 'openTab') {
        this.handleOpenTab(request, sendResponse);
        return true;
      } else if (request.action === 'checkAiStatus') {
        this.handleCheckAiStatus(request, sendResponse);
        return true;
      } else if (request.action === 'syncToDashboard') {
        this.handleSyncToDashboard(request, sendResponse);
        return true;
      } else if (request.action === 'fetchRealNews') {
        this.handleFetchRealNews(request, sendResponse);
        return true;
      }
    });
  }

  async handleOpenTab(request, sendResponse) {
    try {
      console.log('Background: Opening tab for URL:', request.url);
      const tab = await chrome.tabs.create({ url: request.url });
      console.log('Background: Tab opened successfully:', tab.id);
      sendResponse({ success: true, tabId: tab.id });
    } catch (error) {
      console.error('Background: Error opening tab:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleCheckAiStatus(request, sendResponse) {
    // AI status check needs to be done from popup context, not service worker
    sendResponse({
      available: false,
      reason: 'AI status check must be done from popup context - window.ai not available in service workers'
    });
  }

  async handleSyncToDashboard(request, sendResponse) {
    try {
      const { articles } = request;

      // Store articles in extension storage for dashboard sync
      await chrome.storage.local.set({
        dashboardArticles: articles,
        lastSync: Date.now()
      });

      console.log('Articles synced to dashboard storage:', articles.length);
      sendResponse({ success: true, count: articles.length });
    } catch (error) {
      console.error('Error syncing to dashboard:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleFetchRealNews(request, sendResponse) {
    try {
      const { sources, newsType, keywords = '' } = request;
      console.log('Fetching real RSS news for:', sources, newsType, 'keywords:', keywords);

      const articles = [];

      for (const source of sources) {
        try {
          const sourceArticles = await this.fetchRSSArticles(source, newsType);
          articles.push(...sourceArticles);
        } catch (error) {
          console.error(`Error fetching RSS for ${source}:`, error);
        }
      }

      // Filter articles by keywords if provided
      let filteredArticles = articles;
      let dateRange = '24 hours';

      if (keywords && keywords.trim()) {
        filteredArticles = this.filterArticlesByKeywords(articles, keywords);
        console.log(`Filtered ${articles.length} articles to ${filteredArticles.length} based on keywords: "${keywords}"`);

        // If we have keywords but very few results, try expanding the date range
        if (filteredArticles.length < 3) {
          console.log(`Only ${filteredArticles.length} articles found for keywords "${keywords}" in past 24 hours. Expanding to 2 weeks...`);

          // Fetch articles with expanded date range (2 weeks)
          const expandedArticles = await this.fetchArticlesWithExpandedDateRange(sources, newsType);
          const expandedFiltered = this.filterArticlesByKeywords(expandedArticles, keywords);

          if (expandedFiltered.length > filteredArticles.length) {
            filteredArticles = expandedFiltered;
            dateRange = '2 weeks';
            console.log(`Expanded search found ${filteredArticles.length} articles in past 2 weeks`);
          }

          // If still not enough results, try website search for BBC and NPR
          if (filteredArticles.length < 3) {
            console.log(`Still only ${filteredArticles.length} articles. Trying website search for BBC and NPR...`);
            const websiteArticles = await this.searchWebsitesForKeywords(sources, keywords);
            if (websiteArticles.length > 0) {
              filteredArticles = [...filteredArticles, ...websiteArticles];
              dateRange = 'website search';
              console.log(`Website search found ${websiteArticles.length} additional articles`);
            }
          }
        }
      }

      const finalArticles = filteredArticles.slice(0, 10);
      console.log(`Fetched ${finalArticles.length} articles from RSS feeds (${dateRange} range)`);
      
      // If no articles found with keywords, provide specific error message
      if (finalArticles.length === 0 && keywords && keywords.trim()) {
        let errorMessage;
        if (dateRange === '2 weeks') {
          errorMessage = `No articles found matching keywords: "${keywords}" in the past 2 weeks. Try different keywords, check spelling, or remove keywords for general news.`;
        } else {
          errorMessage = `No articles found matching keywords: "${keywords}" in the past 24 hours. Try different keywords, check spelling, or remove keywords for general news.`;
        }
        
        sendResponse({
          articles: [],
          dateRange: dateRange,
          keywordSearch: true,
          message: errorMessage
        });
        return;
      }
      
      console.log('Final articles being sent to popup:');
      finalArticles.forEach((article, i) => {
        console.log(`  ${i + 1}. "${article.title?.substring(0, 40)}..." -> ${article.url}`);
      });

      sendResponse({
        articles: finalArticles,
        dateRange: dateRange,
        keywordSearch: !!(keywords && keywords.trim())
      });
    } catch (error) {
      console.error('Error in handleFetchRealNews:', error);
      sendResponse({ articles: [] });
    }
  }

  async fetchArticlesWithExpandedDateRange(sources, newsType) {
    console.log('Fetching articles with expanded 2-week date range...');
    const allArticles = [];

    for (const source of sources) {
      try {
        const articles = await this.fetchRSSArticles(source, newsType, true); // true = expanded range
        allArticles.push(...articles);
      } catch (error) {
        console.error(`Error fetching expanded articles from ${source}:`, error);
      }
    }

    return allArticles;
  }

  async tryAlternativeRSSFeeds(source, newsType, expandedRange = false) {
    // Try alternative RSS sources when primary feeds fail
    const alternativeFeeds = {
      npr: [
        'https://feeds.npr.org/1002/rss.xml', // Home page
        'https://feeds.npr.org/500005/rss.xml' // Morning Edition
      ],
      bbc: [
        'https://feeds.bbci.co.uk/news/rss.xml' // Main BBC feed
      ],
      nytimes: [
        'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
        'https://rss.nytimes.com/services/xml/rss/nyt/TopStories.xml'
      ],
      nbcnews: [
        'https://feeds.nbcnews.com/nbcnews/public/news'
      ],
      foxnews: [
        'https://moxie.foxnews.com/google-publisher/latest.xml'
      ]
    };

    const urls = alternativeFeeds[source] || [];
    const articles = [];

    for (const url of urls) {
      try {
        console.log(`🔄 Trying alternative RSS feed: ${url}`);
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);

        if (response.ok) {
          const text = await response.text();
          const parsedArticles = this.parseRSSContent(text, source, expandedRange);
          articles.push(...parsedArticles);
          console.log(`✅ Alternative RSS successful: ${parsedArticles.length} articles from ${url}`);

          if (articles.length >= 3) break; // Stop when we have enough articles
        }
      } catch (error) {
        console.log(`❌ Alternative RSS failed for ${url}: ${error.message}`);
      }
    }

    return articles;
  }

  async fetchRSSArticles(source, newsType, expandedRange = false) {
    const rssUrls = this.getRSSUrls(source, newsType);
    const articles = [];

    // Try to fetch from RSS feeds with CORS proxy fallback
    for (const url of rssUrls) {
      try {
        console.log(`🔄 Attempting to fetch RSS from: ${url}`);

        // Try direct fetch first
        let response = await fetch(url, {
          mode: 'cors',
          headers: {
            'Accept': 'application/rss+xml, application/xml, text/xml'
          }
        });

        // If CORS fails, try with a CORS proxy
        if (!response.ok) {
          console.log(`Direct fetch failed, trying CORS proxy...`);
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          response = await fetch(proxyUrl);
        }

        if (response.ok) {
          const text = await response.text();
          console.log(`✅ RSS fetch successful for ${url}, content length: ${text.length}`);
          const parsedArticles = this.parseRSSContent(text, source, expandedRange);
          articles.push(...parsedArticles);
          console.log(`📰 Parsed ${parsedArticles.length} articles from ${url}`);
        } else {
          console.log(`❌ RSS fetch failed with status ${response.status} for ${url}`);
        }
      } catch (error) {
        console.log(`❌ RSS fetch failed for ${url}: ${error.message}`);

        // Try alternative CORS proxy
        try {
          console.log(`Trying alternative CORS proxy for ${url}...`);
          const altProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
          const proxyResponse = await fetch(altProxyUrl);

          if (proxyResponse.ok) {
            const text = await proxyResponse.text();
            console.log(`✅ RSS fetch via proxy successful for ${url}`);
            const parsedArticles = this.parseRSSContent(text, source, expandedRange);
            articles.push(...parsedArticles);
            console.log(`📰 Parsed ${parsedArticles.length} articles via proxy from ${url}`);
          }
        } catch (proxyError) {
          console.log(`❌ Proxy fetch also failed: ${proxyError.message}`);
        }
      }
    }

    // If no articles from RSS, try alternative RSS sources or return empty
    if (articles.length === 0) {
      console.log(`⚠️ [${new Date().toLocaleTimeString()}] No RSS articles found for ${source}`);

      // Try alternative RSS sources for this source
      const alternativeArticles = await this.tryAlternativeRSSFeeds(source, newsType, expandedRange);
      if (alternativeArticles.length > 0) {
        console.log(`✅ Found ${alternativeArticles.length} articles from alternative RSS feeds for ${source}`);
        return alternativeArticles;
      }

      console.log(`❌ No real articles available for ${source} - skipping hardcoded fallbacks`);
      return []; // Return empty instead of hardcoded articles
    }

    console.log(`✅ Using ${articles.length} real RSS articles from ${source} with actual article URLs`);
    articles.forEach((article, i) => {
      console.log(`  RSS Article ${i + 1}: "${article.title?.substring(0, 40)}..." -> ${article.url}`);
    });
    return articles;
  }

  generateWorkingArticleUrl(source, section, slug) {
    // Generate URLs that actually work - use real section pages
    // since RSS feeds may fail and fake article URLs don't work

    const workingUrls = {
      bbc: {
        'world-us-canada': 'https://www.bbc.com/news/world-us-canada',
        business: 'https://www.bbc.com/news/business',
        world: 'https://www.bbc.com/news/world'
      },
      npr: {
        politics: 'https://www.npr.org/sections/politics/',
        world: 'https://www.npr.org/sections/world/',
        business: 'https://www.npr.org/sections/business/'
      },
      nytimes: {
        politics: 'https://www.nytimes.com/section/us/politics',
        world: 'https://www.nytimes.com/section/world',
        us: 'https://www.nytimes.com/section/us'
      },
      nbcnews: {
        politics: 'https://www.nbcnews.com/politics',
        world: 'https://www.nbcnews.com/world',
        us: 'https://www.nbcnews.com/news/us-news'
      },
      foxnews: {
        politics: 'https://www.foxnews.com/politics',
        world: 'https://www.foxnews.com/world',
        us: 'https://www.foxnews.com/us'
      }
    };

    const sourceUrls = workingUrls[source];
    if (sourceUrls && sourceUrls[section]) {
      return sourceUrls[section];
    }

    // Fallback to main section pages
    const fallbackUrls = {
      bbc: 'https://www.bbc.com/news',
      npr: 'https://www.npr.org/sections/news/',
      nytimes: 'https://www.nytimes.com',
      nbcnews: 'https://www.nbcnews.com',
      foxnews: 'https://www.foxnews.com'
    };

    return fallbackUrls[source] || `https://www.${source}.com`;
  }

  generateSampleArticles(source, newsType) {
    // No longer generate sample articles - only use real RSS feeds
    console.log(`⚠️ [${new Date().toLocaleTimeString()}] No sample articles for ${source.toUpperCase()} - only using real RSS feeds`);
    return [];
  }

  getRSSUrls(source, newsType) {
    // Use general RSS feeds since news type selection is removed
    // Combining multiple feeds for broader coverage
    const urls = {
      bbc: [
        'https://feeds.bbci.co.uk/news/rss.xml', // Main BBC feed
        'https://feeds.bbci.co.uk/news/world/rss.xml', // World news
        'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' // US news
      ],
      npr: [
        'https://feeds.npr.org/1001/rss.xml', // News
        'https://feeds.npr.org/1003/rss.xml', // All Things Considered
        'https://feeds.npr.org/1004/rss.xml'  // World news
      ],
      nytimes: [
        'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', // Home page
        'https://rss.nytimes.com/services/xml/rss/nyt/US.xml', // US news
        'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' // World news
      ],
      nbcnews: [
        'https://feeds.nbcnews.com/nbcnews/public/news', // General news
        'https://feeds.nbcnews.com/nbcnews/public/politics', // Politics
        'https://feeds.nbcnews.com/nbcnews/public/world' // World news
      ],
      foxnews: [
        'https://moxie.foxnews.com/google-publisher/latest.xml', // Latest news
        'https://moxie.foxnews.com/google-publisher/politics.xml', // Politics
        'https://moxie.foxnews.com/google-publisher/world.xml' // World news
      ]
    };

    return urls[source] || [];
  }

  filterArticlesByKeywords(articles, keywords) {
    if (!keywords || !keywords.trim()) {
      return articles;
    }

    const keywordList = keywords.toLowerCase().split(/[,\s]+/).filter(k => k.length > 2);
    console.log('Filtering articles with keywords:', keywordList);

    return articles.filter(article => {
      const searchText = `${article.title} ${article.content}`.toLowerCase();

      // Check if any keyword matches
      return keywordList.some(keyword => {
        return searchText.includes(keyword);
      });
    });
  }

  async handleFetchNews(request, sendResponse) {
    try {
      console.log('Background: Handling fetch news request:', request);
      const { sources, newsType, keywords = '' } = request;

      if (!sources || sources.length === 0) {
        throw new Error('No news sources selected');
      }

      console.log('Background: Fetching articles from RSS feeds...');
      const result = await this.fetchArticles(sources, newsType, keywords);
      const articles = result.articles;
      const searchInfo = result.searchInfo;
      
      console.log('Background: Got articles:', articles.length);

      if (articles.length === 0) {
        // Provide specific error messages based on search type and time range
        console.log('No articles found, this might be due to RSS feed issues or keyword filtering');
        
        let errorMessage;
        if (keywords && keywords.trim()) {
          if (searchInfo.expandedSearch) {
            errorMessage = `No articles found matching keywords: "${keywords}" in the past 2 weeks. Try different keywords, check spelling, or remove keywords for general news.`;
          } else {
            errorMessage = `No articles found matching keywords: "${keywords}" in the past 24 hours. Try different keywords, check spelling, or remove keywords for general news.`;
          }
        } else {
          errorMessage = 'No articles available at the moment. This might be due to RSS feed connectivity issues. Please try again later.';
        }
        
        sendResponse({
          summaries: [],
          message: errorMessage,
          searchInfo: searchInfo
        });
        return;
      }

      console.log('Background: Fetching full article content from hyperlinks...');
      const articlesWithFullContent = await this.fetchFullArticleContent(articles);
      
      console.log('Background: Summarizing articles with full content...');
      const summaries = await this.summarizeArticles(articlesWithFullContent);
      console.log('Background: Got summaries:', summaries.length);

      sendResponse({ 
        summaries: summaries,
        searchInfo: searchInfo
      });
    } catch (error) {
      console.error('Background: Error in handleFetchNews:', error);
      sendResponse({ error: error.message });
    }
  }

  async fetchArticles(sources, newsType, keywords = '') {
    const allArticles = [];

    for (const source of sources) {
      try {
        const articles = await this.fetchRSSArticles(source, newsType);
        allArticles.push(...articles);
      } catch (error) {
        console.error(`Error fetching from ${source}:`, error);
      }
    }

    // Filter by keywords if provided with adaptive date range
    let filteredArticles = allArticles;
    let searchInfo = {
      dateRange: '24 hours',
      keywordSearch: false,
      expandedSearch: false,
      websiteSearch: false
    };

    if (keywords && keywords.trim()) {
      searchInfo.keywordSearch = true;
      filteredArticles = this.filterArticlesByKeywords(allArticles, keywords);
      console.log(`Filtered ${allArticles.length} articles to ${filteredArticles.length} based on keywords: "${keywords}"`);

      // If we have keywords but very few results, try expanding the date range
      if (filteredArticles.length < 3) {
        console.log(`Only ${filteredArticles.length} articles found for keywords "${keywords}" in past 24 hours. Expanding to 2 weeks...`);

        // Fetch articles with expanded date range (2 weeks)
        const expandedArticles = await this.fetchArticlesWithExpandedDateRange(sources, newsType);
        const expandedFiltered = this.filterArticlesByKeywords(expandedArticles, keywords);

        if (expandedFiltered.length > filteredArticles.length) {
          filteredArticles = expandedFiltered;
          searchInfo.dateRange = '2 weeks';
          searchInfo.expandedSearch = true;
          console.log(`Expanded search found ${filteredArticles.length} articles in past 2 weeks`);
        }

        // If still not enough results, try website search
        if (filteredArticles.length < 3) {
          console.log(`Still only ${filteredArticles.length} articles. Trying website search...`);
          const websiteArticles = await this.searchWebsitesForKeywords(sources, keywords);
          if (websiteArticles.length > 0) {
            filteredArticles = [...filteredArticles, ...websiteArticles];
            searchInfo.websiteSearch = true;
            console.log(`Website search found ${websiteArticles.length} additional articles`);
          }
        }
      }
    }

    return {
      articles: filteredArticles.slice(0, 10), // Limit to 10 articles for performance
      searchInfo: searchInfo
    };
  }

  async searchWebsitesForKeywords(sources, keywords) {
    const websiteArticles = [];

    for (const source of sources) {
      if (['bbc', 'npr', 'nytimes', 'nbcnews', 'foxnews'].includes(source)) {
        try {
          console.log(`🔍 Searching ${source.toUpperCase()} website for keywords: "${keywords}"`);
          const articles = await this.searchWebsite(source, keywords);
          websiteArticles.push(...articles);
          console.log(`📰 Found ${articles.length} articles from ${source.toUpperCase()} website search`);
        } catch (error) {
          console.error(`❌ Website search failed for ${source}:`, error.message);
        }
      }
    }

    return websiteArticles;
  }

  async searchWebsite(source, keywords) {
    const searchUrls = {
      bbc: `https://www.bbc.com/search?q=${encodeURIComponent(keywords)}`,
      npr: `https://www.npr.org/search?query=${encodeURIComponent(keywords)}&page=1`,
      nytimes: `https://www.nytimes.com/search?query=${encodeURIComponent(keywords)}`,
      nbcnews: `https://www.nbcnews.com/search/?q=${encodeURIComponent(keywords)}`,
      foxnews: `https://www.foxnews.com/search-results/search?q=${encodeURIComponent(keywords)}`
    };

    const searchUrl = searchUrls[source];
    if (!searchUrl) return [];

    try {
      // Use CORS proxy to fetch the search page
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Search request failed with status ${response.status}`);
      }

      const data = await response.json();
      const html = data.contents;

      console.log(`✅ Successfully fetched ${source.toUpperCase()} search page`);

      // Parse the search results
      return this.parseSearchResults(html, source, keywords);

    } catch (error) {
      console.error(`❌ Failed to search ${source} website:`, error.message);

      // Try alternative CORS proxy
      try {
        const altProxyUrl = `https://corsproxy.io/?${encodeURIComponent(searchUrl)}`;
        const altResponse = await fetch(altProxyUrl);

        if (altResponse.ok) {
          const html = await altResponse.text();
          console.log(`✅ Successfully fetched ${source.toUpperCase()} search page via alternative proxy`);
          return this.parseSearchResults(html, source, keywords);
        }
      } catch (altError) {
        console.error(`❌ Alternative proxy also failed for ${source}:`, altError.message);
      }

      return [];
    }
  }

  parseSearchResults(html, source, keywords) {
    const articles = [];

    try {
      if (source === 'bbc') {
        // Parse BBC search results
        const articleRegex = /<article[^>]*>[\s\S]*?<\/article>/gi;
        const matches = html.match(articleRegex) || [];

        matches.slice(0, 5).forEach(match => {
          const titleMatch = match.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
          const linkMatch = match.match(/href=["']([^"']*bbc\.com[^"']*)["']/i);
          const summaryMatch = match.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

          if (titleMatch && linkMatch) {
            const title = this.cleanHTMLText(titleMatch[1]);
            const url = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.bbc.com${linkMatch[1]}`;
            const summary = summaryMatch ? this.cleanHTMLText(summaryMatch[1]) : title;

            if (title.length > 10 && url.includes('bbc.com')) {
              articles.push({
                title: title.substring(0, 200),
                url: url,
                content: summary.substring(0, 500),
                source: 'BBC',
                publishedDate: new Date(), // Current date as fallback
                timeAgo: 'Recent'
              });
            }
          }
        });

      } else if (source === 'npr') {
        // Parse NPR search results
        const articleRegex = /<article[^>]*>[\s\S]*?<\/article>/gi;
        const matches = html.match(articleRegex) || [];

        matches.slice(0, 5).forEach(match => {
          const titleMatch = match.match(/<h[1-6][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[1-6]>/i);
          const linkMatch = match.match(/<a[^>]*href=["']([^"']*npr\.org[^"']*)["']/i);
          const summaryMatch = match.match(/<p[^>]*class="[^"]*teaser[^"]*"[^>]*>([\s\S]*?)<\/p>/i);

          if (titleMatch && linkMatch) {
            const title = this.cleanHTMLText(titleMatch[1]);
            const url = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.npr.org${linkMatch[1]}`;
            const summary = summaryMatch ? this.cleanHTMLText(summaryMatch[1]) : title;

            if (title.length > 10 && url.includes('npr.org')) {
              articles.push({
                title: title.substring(0, 200),
                url: url,
                content: summary.substring(0, 500),
                source: 'NPR',
                publishedDate: new Date(), // Current date as fallback
                timeAgo: 'Recent'
              });
            }
          }
        });
      }

      console.log(`🎯 Parsed ${articles.length} articles from ${source.toUpperCase()} website search`);

    } catch (error) {
      console.error(`❌ Error parsing ${source} search results:`, error.message);
    }

    return articles;
  }

  cleanHTMLText(text) {
    if (!text) return '';

    return text
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async fetchFullArticleContent(articles) {
    console.log(`🔍 Fetching full content for ${articles.length} articles...`);
    const articlesWithContent = [];

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.log(`📰 Processing article ${i + 1}/${articles.length}: "${article.title.substring(0, 50)}..."`);

      try {
        const fullContent = await this.extractArticleContent(article.url, article.source);
        
        if (fullContent && fullContent.length > 200) {
          console.log(`✅ Extracted ${fullContent.length} characters of content from ${article.source}`);
          articlesWithContent.push({
            ...article,
            content: fullContent,
            hasFullContent: true
          });
        } else {
          console.log(`⚠️ Could not extract full content, using RSS summary for ${article.source}`);
          articlesWithContent.push({
            ...article,
            hasFullContent: false
          });
        }
      } catch (error) {
        console.error(`❌ Error fetching content for ${article.url}:`, error.message);
        articlesWithContent.push({
          ...article,
          hasFullContent: false
        });
      }

      // Add small delay to avoid overwhelming servers
      if (i < articles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`📊 Successfully extracted full content for ${articlesWithContent.filter(a => a.hasFullContent).length}/${articles.length} articles`);
    return articlesWithContent;
  }

  async extractArticleContent(url, source) {
    try {
      console.log(`🌐 Fetching full article from: ${url}`);

      // Use CORS proxy to fetch the article page
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const html = data.contents;

      if (!html || html.length < 100) {
        throw new Error('Empty or invalid HTML content');
      }

      console.log(`✅ Fetched HTML content (${html.length} chars) from ${source}`);

      // Extract article content based on source-specific selectors
      const content = this.parseArticleContent(html, source, url);
      
      if (content && content.length > 200) {
        console.log(`📄 Extracted article content: ${content.length} characters`);
        return content;
      } else {
        throw new Error('Could not extract meaningful content');
      }

    } catch (error) {
      console.error(`❌ Failed to extract content from ${url}:`, error.message);

      // Try alternative CORS proxy
      try {
        console.log(`🔄 Trying alternative proxy for ${url}...`);
        const altProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const altResponse = await fetch(altProxyUrl);

        if (altResponse.ok) {
          const html = await altResponse.text();
          const content = this.parseArticleContent(html, source, url);
          
          if (content && content.length > 200) {
            console.log(`✅ Alternative proxy succeeded: ${content.length} characters`);
            return content;
          }
        }
      } catch (altError) {
        console.error(`❌ Alternative proxy also failed:`, altError.message);
      }

      return null;
    }
  }

  parseArticleContent(html, source, url) {
    try {
      // Common article content selectors for different news sources
      const contentSelectors = {
        bbc: [
          'div[data-component="text-block"]',
          '.story-body__inner',
          '[data-component="text-block"] p',
          'article p',
          '.gel-body-copy'
        ],
        npr: [
          '.storytext p',
          '#storytext p',
          '.transcript p',
          'article p',
          '.story-text p'
        ],
        nytimes: [
          '.StoryBodyCompanionColumn p',
          '.css-53u6y8 p',
          'section[name="articleBody"] p',
          'article p',
          '.story-content p'
        ],
        nbcnews: [
          '.ArticleBody-articleBody p',
          '.InlineVideo-container ~ p',
          'article p',
          '.story-text p'
        ],
        foxnews: [
          '.article-body p',
          '.article-text p',
          'article p',
          '.story-content p'
        ]
      };

      const sourceKey = source.toLowerCase().replace(/\s+/g, '');
      const selectors = contentSelectors[sourceKey] || ['article p', '.content p', '.story p', 'p'];

      let extractedText = '';

      // Try each selector until we find content
      for (const selector of selectors) {
        const matches = this.extractTextBySelector(html, selector);
        if (matches && matches.length > 200) {
          extractedText = matches;
          console.log(`✅ Content extracted using selector: ${selector}`);
          break;
        }
      }

      // Fallback: extract all paragraph text if specific selectors fail
      if (!extractedText || extractedText.length < 200) {
        console.log(`⚠️ Specific selectors failed, trying fallback extraction for ${source}`);
        extractedText = this.extractFallbackContent(html);
      }

      // Clean and validate the extracted text
      if (extractedText && extractedText.length > 200) {
        const cleanText = this.cleanExtractedText(extractedText);
        
        // Ensure we have substantial content (not just navigation/ads)
        if (cleanText.length > 300 && this.isValidArticleContent(cleanText)) {
          console.log(`📄 Successfully extracted ${cleanText.length} characters of article content`);
          return cleanText.substring(0, 3000); // Limit to 3000 chars for performance
        }
      }

      console.log(`❌ Could not extract valid article content from ${url}`);
      return null;

    } catch (error) {
      console.error(`❌ Error parsing article content:`, error.message);
      return null;
    }
  }

  extractTextBySelector(html, selector) {
    try {
      // Simple regex-based extraction since we can't use DOM parser in service worker
      let content = '';

      if (selector.includes('p')) {
        // Extract paragraph content
        const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        const matches = html.match(paragraphRegex) || [];
        
        content = matches
          .map(match => {
            const textMatch = match.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
            return textMatch ? this.cleanHTMLText(textMatch[1]) : '';
          })
          .filter(text => text.length > 20) // Filter out short paragraphs
          .join(' ')
          .trim();
      } else {
        // Try to extract content from div or other containers
        const containerRegex = new RegExp(`<${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'gi');
        const matches = html.match(containerRegex) || [];
        
        content = matches
          .map(match => this.cleanHTMLText(match))
          .join(' ')
          .trim();
      }

      return content;
    } catch (error) {
      console.error(`Error extracting text with selector ${selector}:`, error.message);
      return '';
    }
  }

  extractFallbackContent(html) {
    try {
      // Extract all paragraph content as fallback
      const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      const matches = html.match(paragraphRegex) || [];
      
      const paragraphs = matches
        .map(match => {
          const textMatch = match.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
          return textMatch ? this.cleanHTMLText(textMatch[1]) : '';
        })
        .filter(text => {
          // Filter out navigation, ads, and other non-article content
          const lowerText = text.toLowerCase();
          return text.length > 30 && 
                 !lowerText.includes('cookie') &&
                 !lowerText.includes('subscribe') &&
                 !lowerText.includes('newsletter') &&
                 !lowerText.includes('advertisement') &&
                 !lowerText.includes('follow us') &&
                 !lowerText.includes('share this') &&
                 !lowerText.includes('related articles');
        });

      return paragraphs.join(' ').trim();
    } catch (error) {
      console.error('Error in fallback content extraction:', error.message);
      return '';
    }
  }

  cleanExtractedText(text) {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .replace(/\t+/g, ' ') // Replace tabs with spaces
      .replace(/[^\w\s.,!?;:'"()-]/g, '') // Remove special characters but keep punctuation
      .trim();
  }

  isValidArticleContent(text) {
    if (!text || text.length < 300) return false;

    // Check if the text looks like article content (not navigation/ads)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Should have multiple sentences
    if (sentences.length < 3) return false;

    // Check for common non-article patterns
    const lowerText = text.toLowerCase();
    const badPatterns = [
      'click here', 'subscribe now', 'advertisement', 'sponsored content',
      'follow us on', 'share this article', 'related stories', 'trending now'
    ];

    const badPatternCount = badPatterns.filter(pattern => lowerText.includes(pattern)).length;
    
    // If more than 2 bad patterns, probably not article content
    return badPatternCount <= 2;
  }

  parseRSSContent(content, source, expandedRange = false) {
    const articles = [];

    try {
      console.log(`Parsing RSS content for ${source}, content length: ${content.length}`);

      // Use regex to extract RSS items since DOMParser is not available in service workers
      const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
      const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;

      let matches = [...content.matchAll(itemRegex), ...content.matchAll(entryRegex)];
      console.log(`Found ${matches.length} RSS items for ${source}`);

      matches.slice(0, 5).forEach((match, index) => {
        const itemContent = match[1];

        // Extract title
        const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? this.cleanXMLText(titleMatch[1]) : null;

        // Extract link
        const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
          itemContent.match(/<link[^>]*href=["']([^"']+)["']/i);
        const link = linkMatch ? this.cleanXMLText(linkMatch[1]) : null;

        // Extract publication date
        const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
          itemContent.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
          itemContent.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
          itemContent.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);
        const pubDateStr = pubDateMatch ? this.cleanXMLText(pubDateMatch[1]) : null;

        // Parse and validate publication date
        const pubDate = this.parsePublicationDate(pubDateStr);
        const isRecent = expandedRange ? this.isWithinTwoWeeks(pubDate) : this.isWithin24Hours(pubDate);
        const dateRangeText = expandedRange ? '2 weeks' : '24 hours';

        // Extract description
        const descMatch = itemContent.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
          itemContent.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
          itemContent.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
        const description = descMatch ? this.cleanXMLText(descMatch[1]) : title;

        console.log(`RSS item ${index + 1}:`);
        console.log(`  Title: "${title?.substring(0, 50)}..."`);
        console.log(`  URL: "${link}"`);
        console.log(`  Date: "${pubDateStr}"`);
        console.log(`  Within ${dateRangeText}: ${isRecent}`);

        // Include articles within the specified date range or if we can't determine the date
        if (title && link && title.length > 10 && (isRecent || pubDate === null)) {
          articles.push({
            title: title.substring(0, 200),
            url: link,
            content: description ? description.substring(0, 500) : title,
            source: source.toUpperCase(),
            publishedDate: pubDate,
            timeAgo: this.getTimeAgo(pubDate)
          });
        }
      });
    } catch (error) {
      console.error('Error parsing RSS content:', error);
    }

    console.log(`Parsed ${articles.length} articles from RSS for ${source} (filtered to past 24 hours)`);
    return articles;
  }

  parsePublicationDate(dateStr) {
    if (!dateStr) return null;

    try {
      // Try to parse various date formats commonly used in RSS feeds
      // RFC 2822 format: "Wed, 16 Oct 2024 14:30:00 GMT"
      // ISO 8601 format: "2024-10-16T14:30:00Z"

      const date = new Date(dateStr);

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.log(`Invalid date format: ${dateStr}`);
        return null;
      }

      return date;
    } catch (error) {
      console.log(`Error parsing date "${dateStr}":`, error.message);
      return null;
    }
  }

  isWithin24Hours(date) {
    if (!date) return true; // If we can't determine the date, include the article

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const isRecent = date >= twentyFourHoursAgo;
    console.log(`Date check: ${date.toISOString()} is ${isRecent ? 'within' : 'older than'} 24 hours`);

    return isRecent;
  }

  isWithinTwoWeeks(date) {
    if (!date) return true; // If we can't determine the date, include the article

    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));

    const isRecent = date >= twoWeeksAgo;
    console.log(`Date check: ${date.toISOString()} is ${isRecent ? 'within' : 'older than'} 2 weeks`);

    return isRecent;
  }

  getTimeAgo(date) {
    if (!date) return 'Recent';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
  }

  cleanXMLText(text) {
    if (!text) return '';

    return text
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') // Remove CDATA
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  async summarizeArticles(articles) {
    const summaries = [];

    for (const article of articles) {
      try {
        let summary;
        
        if (article.hasFullContent && article.content.length > 500) {
          // Enhanced summarization for full article content
          console.log(`📄 Creating enhanced summary for full article: "${article.title.substring(0, 40)}..."`);
          summary = this.enhancedSummarize(article.content, article.title);
        } else {
          // Basic summarization for RSS content
          console.log(`📰 Creating basic summary for RSS content: "${article.title.substring(0, 40)}..."`);
          summary = this.fallbackSummarize(article.content);
        }

        summaries.push({
          title: article.title,
          url: article.url,
          summary: summary,
          source: article.source,
          category: 'News',
          timeAgo: article.timeAgo || 'Recent',
          hasFullContent: article.hasFullContent || false
        });
      } catch (error) {
        console.error('Error summarizing article:', error);
        // Fallback to truncated content
        summaries.push({
          title: article.title,
          url: article.url,
          summary: article.content.substring(0, 150) + '...',
          source: article.source,
          category: 'News',
          timeAgo: article.timeAgo || 'Recent',
          hasFullContent: false
        });
      }
    }

    console.log(`📊 Summarization complete: ${summaries.filter(s => s.hasFullContent).length}/${summaries.length} with full content`);
    return summaries;
  }

  enhancedSummarize(fullContent, title) {
    try {
      // Split content into sentences
      const sentences = fullContent.split(/[.!?]+/).filter(s => s.trim().length > 15);
      
      if (sentences.length === 0) {
        return fullContent.substring(0, 200) + '...';
      }

      // Extract key information from the full article
      const keyPoints = this.extractKeyPoints(sentences, title);
      
      // Create a comprehensive summary
      if (keyPoints.length > 0) {
        return keyPoints.join(' ') + (keyPoints.join(' ').length < fullContent.length * 0.1 ? ' Additional details available in full article.' : '');
      } else {
        // Fallback to first few sentences
        return sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '.' : '');
      }
    } catch (error) {
      console.error('Error in enhanced summarization:', error);
      return this.fallbackSummarize(fullContent);
    }
  }

  extractKeyPoints(sentences, title) {
    const keyPoints = [];
    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    // Score sentences based on relevance
    const scoredSentences = sentences.map(sentence => {
      const lowerSentence = sentence.toLowerCase();
      let score = 0;
      
      // Higher score for sentences containing title keywords
      titleWords.forEach(word => {
        if (lowerSentence.includes(word)) {
          score += 2;
        }
      });
      
      // Higher score for sentences with key news indicators
      const newsKeywords = [
        'said', 'announced', 'reported', 'according to', 'officials', 'government',
        'president', 'minister', 'spokesperson', 'confirmed', 'revealed', 'stated',
        'investigation', 'policy', 'decision', 'agreement', 'deal', 'plan', 'program'
      ];
      
      newsKeywords.forEach(keyword => {
        if (lowerSentence.includes(keyword)) {
          score += 1;
        }
      });
      
      // Higher score for sentences with numbers/statistics
      if (/\d+/.test(sentence)) {
        score += 1;
      }
      
      // Lower score for very short or very long sentences
      if (sentence.length < 50 || sentence.length > 200) {
        score -= 1;
      }
      
      return { sentence: sentence.trim(), score };
    });
    
    // Sort by score and take top sentences
    const topSentences = scoredSentences
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(item => item.sentence);
    
    // If we have good sentences, use them
    if (topSentences.length >= 2) {
      return topSentences;
    }
    
    // Fallback to first few sentences
    return sentences.slice(0, 3).map(s => s.trim());
  }

  fallbackSummarize(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length === 0) {
      return text.substring(0, 150) + '...';
    }
    return sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '.' : '');
  }
}

// Initialize background script
new NewsBackground();