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
        world: 'https://www.bbc.com/news/world',
        technology: 'https://www.bbc.com/news/technology',
        'science-environment': 'https://www.bbc.com/news/science-environment'
      },
      npr: {
        politics: 'https://www.npr.org/sections/politics/',
        world: 'https://www.npr.org/sections/world/',
        technology: 'https://www.npr.org/sections/technology/',
        business: 'https://www.npr.org/sections/business/'
      }
    };

    const sourceUrls = workingUrls[source];
    if (sourceUrls && sourceUrls[section]) {
      return sourceUrls[section];
    }

    // Fallback to main section pages
    const fallbackUrls = {
      bbc: 'https://www.bbc.com/news',
      npr: 'https://www.npr.org/sections/news/'
    };

    return fallbackUrls[source] || `https://www.${source}.com`;
  }

  generateSampleArticles(source, newsType) {
    // Generate sample articles when RSS feeds are not available
    // This ensures the extension always has content to display
    console.log(`🎯 [${new Date().toLocaleTimeString()}] Generating sample articles for ${source.toUpperCase()} - ${newsType}`);

    const sampleArticles = {
      bbc: {
        us: [
          {
            title: "US Political Landscape Shifts with New Policy Initiatives",
            content: "Recent political developments in Washington are reshaping the national agenda, with new policy initiatives addressing key domestic challenges.",
            url: this.generateWorkingArticleUrl('bbc', 'world-us-canada', 'us-political-landscape-policy-initiatives')
          },
          {
            title: "American Economic Indicators Point to Continued Growth",
            content: "Latest economic data suggests sustained growth in key sectors of the American economy, with positive implications for employment and investment.",
            url: this.generateWorkingArticleUrl('bbc', 'business', 'american-economic-indicators-growth')
          }
        ],
        world: [
          {
            title: "Global Financial Markets Demonstrate Resilience",
            content: "International financial markets continue to show stability despite ongoing global uncertainties, with investors maintaining confidence in long-term prospects.",
            url: this.generateWorkingArticleUrl('bbc', 'business', 'global-financial-markets-resilience')
          },
          {
            title: "International Cooperation Strengthens on Global Challenges",
            content: "Countries worldwide are enhancing diplomatic cooperation to address shared challenges including climate change, security, and economic stability.",
            url: this.generateWorkingArticleUrl('bbc', 'world', 'international-cooperation-global-challenges')
          }
        ],
        tech: [
          {
            title: "Digital Innovation Transforms Traditional Industries",
            content: "Ongoing digital transformation is revolutionizing traditional industries, creating new opportunities for efficiency and innovation across multiple sectors.",
            url: this.generateWorkingArticleUrl('bbc', 'technology', 'digital-innovation-transforms-industries')
          },
          {
            title: "Renewable Energy Technology Achieves New Milestones",
            content: "Significant advances in renewable energy technology are making clean energy more accessible and efficient, supporting global sustainability goals.",
            url: this.generateWorkingArticleUrl('bbc', 'science-environment', 'renewable-energy-technology-milestones')
          }
        ]
      }
    };

    // Add sample articles for NPR with realistic article URLs
    if (!sampleArticles[source]) {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '/');

      sampleArticles[source] = {
        us: [
          {
            title: "Congressional Leaders Debate Infrastructure Spending in Heated Session [UPDATED]",
            content: "House and Senate leaders engaged in intense discussions over the proposed infrastructure bill, with both parties seeking compromise on key provisions.",
            url: this.generateWorkingArticleUrl(source, 'politics', 'latest-us-political-developments')
          }
        ],
        world: [
          {
            title: "International Climate Summit Yields New Commitments from Major Nations [UPDATED]",
            content: "World leaders at the climate summit announced significant new commitments to reduce carbon emissions and increase renewable energy investments.",
            url: this.generateWorkingArticleUrl(source, 'world', 'international-news-updates')
          }
        ],
        tech: [
          {
            title: "Breakthrough in Quantum Computing Research Shows Promise for Future Applications [UPDATED]",
            content: "Researchers have achieved a significant breakthrough in quantum computing that could revolutionize data processing and cybersecurity applications.",
            url: this.generateWorkingArticleUrl(source, 'technology', 'innovation-report')
          }
        ]
      };
    }

    const categoryArticles = sampleArticles[source][newsType] || sampleArticles[source].us || [];

    const finalArticles = categoryArticles.map((article, index) => {
      // Generate timestamps for sample articles with variety
      const now = new Date();
      let publishedDate;

      // Mix of recent and older articles for more realistic distribution
      if (index === 0) {
        // First article is very recent (1-6 hours ago)
        const hoursAgo = Math.floor(Math.random() * 6) + 1;
        const minutesAgo = Math.floor(Math.random() * 60);
        publishedDate = new Date(now.getTime() - (hoursAgo * 60 * 60 * 1000) - (minutesAgo * 60 * 1000));
      } else {
        // Other articles can be older (1-7 days ago for variety)
        const daysAgo = Math.floor(Math.random() * 7) + 1;
        const hoursAgo = Math.floor(Math.random() * 24);
        publishedDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000) - (hoursAgo * 60 * 60 * 1000));
      }

      const finalArticle = {
        title: article.title,
        url: article.url,
        content: article.content,
        source: source.toUpperCase(),
        publishedDate: publishedDate,
        timeAgo: this.getTimeAgo(publishedDate)
      };

      console.log(`🔍 Generated sample article for ${source}: "${finalArticle.title}"`);
      return finalArticle;
    });

    return finalArticles;
  }

  getRSSUrls(source, newsType) {
    // Use RSS feeds that are known to work with CORS or provide fallback content
    const urls = {
      bbc: {
        us: ['https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml'],
        world: ['https://feeds.bbci.co.uk/news/world/rss.xml'],
        tech: ['https://feeds.bbci.co.uk/news/technology/rss.xml']
      },
      npr: {
        us: [
          'https://feeds.npr.org/1001/rss.xml',
          'https://feeds.npr.org/1003/rss.xml'
        ],
        world: [
          'https://feeds.npr.org/1004/rss.xml'
        ],
        tech: [
          'https://feeds.npr.org/1019/rss.xml'
        ]
      }
    };

    return urls[source]?.[newsType] || urls[source]?.us || [];
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
      const articles = await this.fetchArticles(sources, newsType, keywords);
      console.log('Background: Got articles:', articles.length);

      if (articles.length === 0) {
        // Instead of throwing an error, provide helpful message
        console.log('No articles found, this might be due to RSS feed issues or keyword filtering');
        sendResponse({
          summaries: [],
          message: keywords ?
            `No articles found matching keywords: "${keywords}". Try different keywords or remove them for general news.` :
            'No articles available at the moment. This might be due to RSS feed connectivity issues. Please try again later.'
        });
        return;
      }

      console.log('Background: Summarizing articles...');
      const summaries = await this.summarizeArticles(articles);
      console.log('Background: Got summaries:', summaries.length);

      sendResponse({ summaries });
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
    if (keywords && keywords.trim()) {
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
          console.log(`Expanded search found ${filteredArticles.length} articles in past 2 weeks`);
        }

        // If still not enough results, try website search for BBC and NPR
        if (filteredArticles.length < 3) {
          console.log(`Still only ${filteredArticles.length} articles. Trying website search for BBC and NPR...`);
          const websiteArticles = await this.searchWebsitesForKeywords(sources, keywords);
          if (websiteArticles.length > 0) {
            filteredArticles = [...filteredArticles, ...websiteArticles];
            console.log(`Website search found ${websiteArticles.length} additional articles`);
          }
        }
      }
    }

    return filteredArticles.slice(0, 10); // Limit to 10 articles for performance
  }

  async searchWebsitesForKeywords(sources, keywords) {
    const websiteArticles = [];

    for (const source of sources) {
      if (source === 'bbc' || source === 'npr') {
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
      npr: `https://www.npr.org/search?query=${encodeURIComponent(keywords)}&page=1`
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
        // Use simple text truncation since Gemini Nano is not available in service workers
        const summary = this.fallbackSummarize(article.content);
        summaries.push({
          title: article.title,
          url: article.url,
          summary: summary,
          source: article.source,
          category: 'News',
          timeAgo: 'Recent'
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
          timeAgo: 'Recent'
        });
      }
    }

    return summaries;
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