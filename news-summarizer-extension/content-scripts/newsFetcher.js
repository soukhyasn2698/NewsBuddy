class NewsFetcher {
  constructor() {
    this.init();
  }

  init() {
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractPageContent') {
        this.extractCurrentPageContent(sendResponse);
        return true;
      }
    });
  }

  extractCurrentPageContent(sendResponse) {
    try {
      const content = this.extractArticleContent();
      sendResponse({ content });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  extractArticleContent() {
    // Try to find main article content using common selectors
    const selectors = [
      'article',
      '[role="main"]',
      '.article-content',
      '.story-content',
      '.post-content',
      '.entry-content',
      '.content',
      'main'
    ];

    let content = '';
    let title = '';

    // Extract title
    title = document.querySelector('h1')?.textContent?.trim() || 
            document.title || '';

    // Extract main content
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        content = this.cleanText(element.textContent || '');
        if (content.length > 100) break;
      }
    }

    // Fallback: get all paragraph text
    if (content.length < 100) {
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map(p => p.textContent?.trim())
        .filter(text => text && text.length > 50)
        .slice(0, 5);
      
      content = paragraphs.join(' ');
    }

    return {
      title,
      content: content.substring(0, 2000), // Limit content length
      url: window.location.href,
      source: this.extractSourceName()
    };
  }

  extractSourceName() {
    const hostname = window.location.hostname;
    const sourceMap = {
      'bbc.com': 'BBC',
      'bbc.co.uk': 'BBC',
      'npr.org': 'NPR',
      'nytimes.com': 'NEW YORK TIMES',
      'nbcnews.com': 'NBC NEWS',
      'foxnews.com': 'FOX NEWS',
      'washingtonpost.com': 'Washington Post',
      'theguardian.com': 'The Guardian'
    };

    for (const [domain, name] of Object.entries(sourceMap)) {
      if (hostname.includes(domain)) {
        return name;
      }
    }

    // Fallback: capitalize hostname
    return hostname.replace('www.', '').split('.')[0].toUpperCase();
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
  }

  // Helper method to check if current page is a news article
  isNewsArticle() {
    const indicators = [
      'article',
      '.article',
      '.story',
      '.post',
      '[role="article"]'
    ];

    return indicators.some(selector => document.querySelector(selector));
  }

  // Method to highlight summarizable content
  highlightContent() {
    if (!this.isNewsArticle()) return;

    const style = document.createElement('style');
    style.textContent = `
      .news-summarizer-highlight {
        outline: 2px solid #1a73e8 !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(style);

    const mainContent = document.querySelector('article, [role="main"], .article-content');
    if (mainContent) {
      mainContent.classList.add('news-summarizer-highlight');
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        mainContent.classList.remove('news-summarizer-highlight');
      }, 3000);
    }
  }
}

// Initialize content script
const newsFetcher = new NewsFetcher();

// Export for potential use by other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NewsFetcher;
}