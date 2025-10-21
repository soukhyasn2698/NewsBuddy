class NewsHelpers {
  // RSS/Feed parsing utilities
  static parseRSSFeed(xmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'text/xml');
      
      if (doc.querySelector('parsererror')) {
        throw new Error('Invalid XML format');
      }
      
      const items = doc.querySelectorAll('item, entry');
      const articles = [];
      
      items.forEach(item => {
        const article = {
          title: this.getTextContent(item, 'title'),
          link: this.getTextContent(item, 'link') || item.querySelector('link')?.getAttribute('href'),
          description: this.getTextContent(item, 'description, summary, content'),
          pubDate: this.getTextContent(item, 'pubDate, published, updated'),
          author: this.getTextContent(item, 'author, creator'),
          category: this.getTextContent(item, 'category')
        };
        
        if (article.title && article.link) {
          articles.push(article);
        }
      });
      
      return articles;
    } catch (error) {
      console.error('Error parsing RSS feed:', error);
      return [];
    }
  }

  static getTextContent(element, selectors) {
    const selectorList = selectors.split(',').map(s => s.trim());
    
    for (const selector of selectorList) {
      const found = element.querySelector(selector);
      if (found) {
        return found.textContent?.trim() || found.getAttribute('href');
      }
    }
    
    return null;
  }

  // HTML content extraction
  static extractArticleFromHTML(htmlString, sourceUrl) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      
      // Remove unwanted elements
      this.removeUnwantedElements(doc);
      
      const article = {
        title: this.extractTitle(doc),
        content: this.extractMainContent(doc),
        url: sourceUrl,
        publishDate: this.extractPublishDate(doc),
        author: this.extractAuthor(doc)
      };
      
      return article;
    } catch (error) {
      console.error('Error extracting article from HTML:', error);
      return null;
    }
  }

  static removeUnwantedElements(doc) {
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer',
      '.advertisement', '.ads', '.social-share',
      '.comments', '.related-articles', '.sidebar'
    ];
    
    unwantedSelectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });
  }

  static extractTitle(doc) {
    const titleSelectors = [
      'h1',
      '.article-title',
      '.headline',
      '.entry-title',
      '[property="og:title"]'
    ];
    
    for (const selector of titleSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const title = element.textContent?.trim() || element.getAttribute('content');
        if (title && title.length > 5) {
          return title;
        }
      }
    }
    
    return doc.title || 'Untitled Article';
  }

  static extractMainContent(doc) {
    const contentSelectors = [
      'article',
      '.article-content',
      '.story-content',
      '.post-content',
      '.entry-content',
      '[role="main"]',
      'main'
    ];
    
    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const content = this.cleanText(element.textContent || '');
        if (content.length > 100) {
          return content;
        }
      }
    }
    
    // Fallback: collect all paragraphs
    const paragraphs = Array.from(doc.querySelectorAll('p'))
      .map(p => p.textContent?.trim())
      .filter(text => text && text.length > 30);
    
    return paragraphs.join(' ');
  }

  static extractPublishDate(doc) {
    const dateSelectors = [
      '[property="article:published_time"]',
      '[name="publish-date"]',
      '.publish-date',
      '.article-date',
      'time[datetime]'
    ];
    
    for (const selector of dateSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const date = element.getAttribute('content') || 
                    element.getAttribute('datetime') || 
                    element.textContent?.trim();
        if (date) {
          return new Date(date).toISOString();
        }
      }
    }
    
    return null;
  }

  static extractAuthor(doc) {
    const authorSelectors = [
      '[property="article:author"]',
      '[name="author"]',
      '.author',
      '.byline',
      '.article-author'
    ];
    
    for (const selector of authorSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const author = element.getAttribute('content') || element.textContent?.trim();
        if (author && author.length > 2) {
          return author;
        }
      }
    }
    
    return null;
  }

  // Text processing utilities
  static cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\t+/g, ' ')
      .trim();
  }

  static truncateText(text, maxLength = 150) {
    if (text.length <= maxLength) return text;
    
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > 0 ? 
      truncated.substring(0, lastSpace) + '...' : 
      truncated + '...';
  }

  static extractKeywords(text, count = 5) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, count)
      .map(([word]) => word);
  }

  // URL and domain utilities
  static isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  static getDomainFromUrl(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  static normalizeUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  // Storage utilities
  static async saveToStorage(key, data) {
    try {
      await chrome.storage.sync.set({ [key]: data });
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }

  static async loadFromStorage(key, defaultValue = null) {
    try {
      const result = await chrome.storage.sync.get([key]);
      return result[key] || defaultValue;
    } catch (error) {
      console.error('Error loading from storage:', error);
      return defaultValue;
    }
  }

  // Rate limiting utility
  static createRateLimiter(maxRequests, timeWindow) {
    const requests = [];
    
    return function() {
      const now = Date.now();
      
      // Remove old requests outside the time window
      while (requests.length > 0 && requests[0] < now - timeWindow) {
        requests.shift();
      }
      
      if (requests.length >= maxRequests) {
        return false; // Rate limit exceeded
      }
      
      requests.push(now);
      return true; // Request allowed
    };
  }

  // Error handling utilities
  static createRetryFunction(fn, maxRetries = 3, delay = 1000) {
    return async function(...args) {
      let lastError;
      
      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await fn.apply(this, args);
        } catch (error) {
          lastError = error;
          
          if (i < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
          }
        }
      }
      
      throw lastError;
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NewsHelpers;
} else if (typeof window !== 'undefined') {
  window.NewsHelpers = NewsHelpers;
}