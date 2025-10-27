# AI Prompts for Website-Specific News Generation

## Overview
This document explains where and how AI prompts are used to fetch news from particular websites in the News Buddy Extension.

## Location of AI Prompts

### 1. Background Script (`background.js`)

#### Main Function: `createAIPromptForWebsite(source)`
**Location**: Lines ~180-220 in background.js
**Purpose**: Creates specific AI prompts for each news website (general news coverage)

```javascript
createAIPromptForWebsite(source) {
  const prompts = {
    bbc: `Generate current BBC-style news articles covering general news topics...`,
    npr: `Generate current NPR-style news articles covering general news topics...`,
    nytimes: `Generate current New York Times-style news articles covering general news topics...`,
    nbcnews: `Generate current NBC News-style news articles covering general news topics...`,
    foxnews: `Generate current Fox News-style news articles covering general news topics...`
  };
  return prompts[source];
}
```

#### Function: `generateNewsWithAI(source)`
**Location**: Lines ~160-180 in background.js
**Purpose**: Coordinates AI-powered news generation for general news coverage
**Status**: Currently returns null (placeholder for real AI integration)

### 2. Popup Script (`popup.js`)

#### Function: `generateNewsWithPromptAPI(sources, keywords)`
**Purpose**: Uses AI to generate news articles in the popup context
**Features**: 
- Creates LanguageModel instances
- Sends prompts to AI for general news coverage
- Supports keyword-based news generation
- Parses AI responses into article format

## AI Prompt Templates by Website

### BBC Prompts
```
Generate current BBC-style news articles covering general news topics on [date].
Style: Professional, international perspective, balanced reporting.
Format: JSON array with title, content (200 words), timeAgo.
Topics: Mix of politics, world events, business, technology, and social issues.
Keywords: [optional keywords for focused coverage]
```

### NPR Prompts
```
Generate current NPR-style news articles covering general news topics on [date].
Style: Thoughtful, in-depth analysis, human interest angle.
Format: JSON array with title, content (200 words), timeAgo.
Topics: Social issues, cultural perspectives, policy implications, human stories.
Keywords: [optional keywords for focused coverage]
```

### New York Times Prompts
```
Generate current New York Times-style news articles covering general news topics on [date].
Style: Comprehensive, investigative reporting with authoritative tone.
Format: JSON array with title, content (200 words), timeAgo.
Topics: Breaking news, politics, business, international affairs, culture.
Keywords: [optional keywords for focused coverage]
```

### NBC News Prompts
```
Generate current NBC News-style news articles covering general news topics on [date].
Style: Breaking news format with clear, direct reporting.
Format: JSON array with title, content (200 words), timeAgo.
Topics: Current events, politics, business, technology, health.
Keywords: [optional keywords for focused coverage]
```

### Fox News Prompts
```
Generate current Fox News-style news articles covering general news topics on [date].
Style: Conservative perspective with analysis and commentary.
Format: JSON array with title, content (200 words), timeAgo.
Topics: Politics, business, national security, cultural issues.
Keywords: [optional keywords for focused coverage]
```

## How AI Prompts Are Used

### Step 1: User Selects Sources and Keywords
User checks boxes for BBC, NPR, New York Times, NBC News, and Fox News in the popup
Optionally enters keywords for focused news coverage

### Step 2: Fetch Process Begins
1. **RSS Attempt**: Try to fetch real RSS feeds from multiple general feeds per source
2. **Keyword Filtering**: Filter articles based on user keywords if provided
3. **AI Summarization**: Use Gemini Nano to summarize and enhance articles
4. **Overall Summary**: Generate bullet-point summary of all articles

### Step 3: AI Prompt Execution
```javascript
// In generateNewsWithAI()
const prompt = this.createAIPromptForWebsite(source, keywords);
// Send prompt to AI API (Gemini Nano, etc.)
const aiResponse = await aiAPI.generate(prompt);
// Parse response into article format
```

### Step 4: Article Display
Generated articles are displayed with:
- Website-specific styling
- Realistic timestamps ("40 mins ago")
- Real RSS feed URLs (no mock data)
- Keyword highlighting when applicable
- Overall summary generation option

## Current Implementation Status

### ✅ Implemented
- AI prompt templates for all websites
- Prompt generation logic
- Fallback article creation
- Website-specific styling and formatting

### 🔄 In Progress
- Real AI API integration (currently simulated)
- Dynamic prompt customization
- Response parsing and validation

### 📋 To Implement
- Connect to actual AI APIs (Gemini Nano, OpenAI)
- Error handling for AI responses
- Caching of generated articles
- User customization of prompt styles

## Example AI Prompt Flow

```
User selects: NPR + Keywords: "climate change"
↓
createAIPromptForWebsite("npr", "climate change") generates:
"Generate current NPR-style news articles covering general news topics on Wednesday, October 15, 2024.
Style: Thoughtful, in-depth analysis, human interest angle.
Format: JSON array with title, content (200 words), timeAgo.
Topics: Social issues, cultural perspectives, policy implications, human stories.
Keywords: Focus on climate change related stories and environmental policy."
↓
AI API processes prompt and returns realistic NPR articles about climate change
↓
Articles displayed in extension popup with NPR styling and keyword relevance
↓
User can generate overall summary of all articles using Gemini Summarize API
```

## Integration Points

### For Real AI Integration:
1. **Chrome Summarizer API**: Use `window.ai.summarizer.create()` for optimal summarization
2. **Gemini Nano Language Model**: Use `window.ai.languageModel.create()` as fallback
3. **Custom AI**: Implement custom prompt processing logic

### Chrome Summarizer API Configuration:
```javascript
const summarizer = await window.ai.summarizer.create({
  type: 'key-points',    // Extract key points from news articles
  format: 'markdown',    // Output formatted text with structure
  length: 'medium'       // Balanced summary length
});
```

### Configuration:
- Modify `generateNewsWithAI()` to call real AI APIs
- Update prompt templates in `createNewsPrompt()` for keyword-based generation
- Add error handling and response validation
- Configure keyword filtering and general news coverage
- Implement Gemini Summarize API for overall summaries