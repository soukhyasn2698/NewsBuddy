class GeminiNanoAPI {
  constructor() {
    this.session = null;
    this.isAvailable = false;
    this.checkAvailability();
  }

  async checkAvailability() {
    try {
      this.isAvailable = !!(window.ai && window.ai.languageModel);
      if (this.isAvailable) {
        console.log('Gemini Nano is available');
      } else {
        console.warn('Gemini Nano is not available');
      }
    } catch (error) {
      console.error('Error checking Gemini Nano availability:', error);
      this.isAvailable = false;
    }
  }

  async createSession(options = {}) {
    if (!this.isAvailable) {
      throw new Error('Gemini Nano is not available');
    }

    try {
      const defaultOptions = {
        systemPrompt: 'You are a helpful AI assistant that summarizes news articles concisely and accurately.',
        temperature: 0.3,
        topK: 3
      };

      this.session = await window.ai.languageModel.create({
        ...defaultOptions,
        ...options
      });

      return this.session;
    } catch (error) {
      console.error('Error creating Gemini Nano session:', error);
      throw error;
    }
  }

  async summarize(text, options = {}) {
    if (!this.session) {
      await this.createSession({
        systemPrompt: 'You are a news summarizer. Provide concise, factual summaries of news articles in 1-2 sentences. Focus on the main facts and key information.'
      });
    }

    try {
      const maxLength = options.maxLength || 1000;
      const truncatedText = text.substring(0, maxLength);
      
      const prompt = `Summarize this news article in 1-2 clear sentences:\n\n${truncatedText}`;
      
      const result = await this.session.prompt(prompt);
      return result.trim();
      
    } catch (error) {
      console.error('Error summarizing with Gemini Nano:', error);
      throw error;
    }
  }

  async generateHeadlines(articles) {
    if (!this.session) {
      await this.createSession({
        systemPrompt: 'You are a news headline generator. Create concise, engaging headlines that capture the essence of news articles.'
      });
    }

    const headlines = [];
    
    for (const article of articles) {
      try {
        const prompt = `Create a concise, engaging headline for this news content:\n\n${article.content.substring(0, 500)}`;
        const headline = await this.session.prompt(prompt);
        headlines.push(headline.trim());
      } catch (error) {
        console.error('Error generating headline:', error);
        headlines.push(article.title || 'News Article');
      }
    }
    
    return headlines;
  }

  async categorizeNews(articles) {
    if (!this.session) {
      await this.createSession({
        systemPrompt: 'You are a news categorizer. Classify news articles into categories like Politics, Technology, Sports, Business, Health, etc.'
      });
    }

    const categories = [];
    
    for (const article of articles) {
      try {
        const prompt = `Categorize this news article with a single word category:\n\n${article.title}\n${article.content.substring(0, 300)}`;
        const category = await this.session.prompt(prompt);
        categories.push(category.trim());
      } catch (error) {
        console.error('Error categorizing article:', error);
        categories.push('General');
      }
    }
    
    return categories;
  }

  async batchSummarize(articles, batchSize = 3) {
    const summaries = [];
    
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      const batchPromises = batch.map(article => 
        this.summarize(article.content).catch(error => {
          console.error('Error in batch summarize:', error);
          return article.content.substring(0, 150) + '...';
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      summaries.push(...batchResults);
      
      // Small delay between batches to avoid overwhelming the API
      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return summaries;
  }

  destroySession() {
    if (this.session) {
      try {
        this.session.destroy();
        this.session = null;
      } catch (error) {
        console.error('Error destroying session:', error);
      }
    }
  }

  // Fallback summarization using simple text processing
  fallbackSummarize(text, maxSentences = 2) {
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    
    if (sentences.length <= maxSentences) {
      return sentences.join('. ') + '.';
    }
    
    // Return first few sentences
    return sentences.slice(0, maxSentences).join('. ') + '.';
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeminiNanoAPI;
} else if (typeof window !== 'undefined') {
  window.GeminiNanoAPI = GeminiNanoAPI;
}