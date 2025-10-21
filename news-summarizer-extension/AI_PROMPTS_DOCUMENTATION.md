# AI Prompts for Website-Specific News Generation

## Overview
This document explains where and how AI prompts are used to fetch news from particular websites in the News Summarizer Extension.

## Location of AI Prompts

### 1. Background Script (`background.js`)

#### Main Function: `createAIPromptForWebsite(source, newsType)`
**Location**: Lines ~180-220 in background.js
**Purpose**: Creates specific AI prompts for each news website

```javascript
createAIPromptForWebsite(source, newsType) {
  const prompts = {
    bbc: `Generate 3 current BBC-style news articles...`,
    npr: `Generate 3 current NPR-style news articles...`
  };
  return prompts[source];
}
```

#### Function: `generateNewsWithAI(source, newsType)`
**Location**: Lines ~160-180 in background.js
**Purpose**: Coordinates AI-powered news generation
**Status**: Currently returns null (placeholder for real AI integration)

### 2. Popup Script (`popup.js`)

#### Function: `generateNewsWithPromptAPI(sources, newsType)`
**Purpose**: Uses AI to generate news articles in the popup context
**Features**: 
- Creates LanguageModel instances
- Sends prompts to AI
- Parses AI responses into article format

## AI Prompt Templates by Website

### BBC Prompts
```
Generate 3 current BBC-style news articles for [category] on [date].
Style: Professional, international perspective, balanced reporting.
Format: JSON array with title, content (200 words), category, timeAgo.
Topics: Global perspective, policy analysis.
```

### NPR Prompts
```
Generate 3 current NPR-style news articles for [category] on [date].
Style: Thoughtful, in-depth analysis, human interest angle.
Format: JSON array with title, content (200 words), category, timeAgo.
Topics: Social issues, cultural perspectives, policy implications.
```

## How AI Prompts Are Used

### Step 1: User Selects Sources
User checks boxes for BBC and NPR in the popup

### Step 2: Fetch Process Begins
1. **RSS Attempt**: Try to fetch real RSS feeds (usually blocked by CORS)
2. **AI Generation**: Use AI prompts to generate realistic articles
3. **Fallback**: Use mock data with AI prompt simulation

### Step 3: AI Prompt Execution
```javascript
// In generateNewsWithAI()
const prompt = this.createAIPromptForWebsite(source, newsType);
// Send prompt to AI API (Gemini Nano, OpenAI, etc.)
const aiResponse = await aiAPI.generate(prompt);
// Parse response into article format
```

### Step 4: Article Display
Generated articles are displayed with:
- Website-specific styling
- Realistic timestamps ("40 mins ago")
- Proper categories ("United States", "Business", etc.)
- Working hyperlinks

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
User selects: NPR + US News
↓
createAIPromptForWebsite("npr", "us") generates:
"Generate 3 current NPR-style news articles for us category on Wednesday, October 15, 2024.
Style: Thoughtful, in-depth analysis, human interest angle.
Format: JSON array with title, content (200 words), category, timeAgo.
Topics: Social issues, cultural perspectives, policy implications."
↓
AI API processes prompt and returns realistic NPR articles
↓
Articles displayed in extension popup with NPR styling
```

## Integration Points

### For Real AI Integration:
1. **Gemini Nano**: Use `window.ai.languageModel.create()` in popup context
2. **OpenAI API**: Add API key and endpoint configuration
3. **Custom AI**: Implement custom prompt processing logic

### Configuration:
- Modify `generateNewsWithAI()` to call real AI APIs
- Update prompt templates in `createAIPromptForWebsite()`
- Add error handling and response validation