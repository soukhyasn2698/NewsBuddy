# News Buddy Chrome Extension

Your friendly news companion - a Chrome extension that fetches and summarizes news articles using AI.

## Features

- **Multiple News Sources**: Support for BBC, NPR, New York Times, NBC News, and Fox News
- **Deep Content Analysis**: Fetches full article content from hyperlinks for comprehensive analysis
- **Simplified Interface**: Just select news sources and optionally add keywords
- **AI-Powered Summaries**: Uses Chrome Enhanced Summarizer API exclusively for intelligent article summarization
- **2-Column Layout**: Articles on the left, automatic overall summary on the right
- **Automatic Summary**: AI-generated bullet-point summaries appear instantly using Gemini Summarize API
- **Content Analysis Badges**: Visual indicators showing deep analysis vs RSS summary
- **User Preferences**: Remembers your selected sources and news types
- **Clean Interface**: Simple, intuitive popup design
- **Enhanced Summarization**: Creates better summaries by analyzing full article content

## Installation

1. **Download or Clone** this repository
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in top right)
4. **Click "Load unpacked"** and select the `news-buddy-extension` folder
5. **Get Gemini Nano Access**: 
   - Join the Chrome AI Origin Trial
   - Replace `YOUR_GEMINI_NANO_TRIAL_TOKEN_HERE` in `manifest.json` with your trial token

## Setup for Gemini Nano

To use Gemini Nano, you need to:

1. **Join the Origin Trial**: Visit [Chrome Origin Trials](https://developer.chrome.com/origintrials/) and sign up for the "Built-in AI" trial
2. **Get Your Token**: After approval, you'll receive a trial token
3. **Update Manifest**: Replace the placeholder token in `manifest.json`
4. **Enable Chrome Flags**: 
   - Go to `chrome://flags/`
   - Enable "Prompt API for Gemini Nano"
   - Enable "Enables optimization guide on device"

## Usage

1. **Click the extension icon** in your Chrome toolbar
2. **Select news sources** you want to fetch from (BBC, NPR, New York Times, NBC News, Fox News)
3. **Optionally add keywords** to search for specific topics
4. **Click "Get My News"** to fetch and get AI-generated summaries
5. **View the 2-column layout** with articles on the left and automatic overall summary on the right
6. **Click on any article title** to read the full article

## Project Structure

```
news-buddy-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for fetching and processing
├── popup/
│   ├── popup.html        # Extension popup interface
│   ├── popup.js          # Popup logic and user interactions
│   └── popup.css         # Popup styling
├── content-scripts/
│   └── newsFetcher.js    # Content script for page content extraction
├── utils/
│   ├── api.js            # Gemini Nano API wrapper
│   └── helpers.js        # Utility functions for parsing and processing
├── icons/
│   └── icon.png          # Extension icon (add your own 128x128 PNG)
└── README.md
```

## How It Works

1. **User Selection**: User selects news sources and categories in the popup
2. **Content Fetching**: Background script fetches RSS feeds and HTML content
3. **Content Parsing**: Articles are extracted and cleaned using helper functions
4. **AI Summarization**: Gemini Nano generates concise summaries
5. **Display Results**: Summaries are shown as clickable links in the popup

## Permissions Explained

- **storage**: Save user preferences (selected sources, news types)
- **tabs**: Access current tab information
- **scripting**: Inject content scripts for page content extraction
- **activeTab**: Access content of the currently active tab
- **host_permissions**: Access to news websites for fetching content

## Fallback Behavior

If Gemini Nano is not available, the extension will:
- Use simple text truncation for summaries
- Still fetch and display news articles
- Provide basic content extraction

## Customization

### Adding New News Sources

1. **Update `getSourceUrls()`** in `background.js` with new RSS feeds or URLs
2. **Add checkboxes** in `popup.html` for the new sources
3. **Update parsing logic** in `parseContent()` if needed

### Modifying Summary Length

Adjust the summarization prompts in `utils/api.js`:
```javascript
const prompt = `Summarize this news article in 1-2 clear sentences: ${text}`;
```

### Styling Changes

Modify `popup/popup.css` to customize the appearance:
- Colors, fonts, spacing
- Button styles
- Layout adjustments

## Troubleshooting

### Gemini Nano Not Working
- Ensure you have a valid Origin Trial token
- Check Chrome flags are enabled
- Verify Chrome version supports Gemini Nano

### No Articles Found
- Check network connectivity
- Verify news source URLs are accessible
- Look at browser console for error messages

### Extension Not Loading
- Ensure all files are in correct locations
- Check manifest.json syntax
- Verify permissions are correctly set

## Development

### Testing Locally
1. Load the extension in developer mode
2. Open Chrome DevTools for the extension popup
3. Check console logs for debugging information

### Adding Features
- Modify popup UI in `popup/` folder
- Add background processing in `background.js`
- Extend API functionality in `utils/api.js`

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Notes

- This extension requires Chrome 121+ for Gemini Nano support
- RSS feeds may have CORS restrictions; the extension handles this via background fetching
- Rate limiting is implemented to avoid overwhelming news sources
- Content extraction works best on standard news article layouts