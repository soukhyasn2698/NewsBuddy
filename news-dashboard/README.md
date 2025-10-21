# News Dashboard

A beautiful web dashboard to view and manage all your summarized news articles from the Chrome extension.

## 🚀 Features

- **Article History**: View all your summarized news articles in one place
- **Search & Filter**: Find articles by title, content, source, date, or category
- **Statistics**: See your reading habits with article counts and source diversity
- **Export Options**: Export your data as JSON, CSV, or HTML
- **Responsive Design**: Works perfectly on desktop and mobile
- **Real-time Sync**: Automatically syncs with your Chrome extension

## 📱 Screenshots

### Dashboard Overview
- Clean, modern interface with article cards
- Real-time statistics and filtering options
- Search functionality with instant results

### Article Details
- Click any article to view full summary in a modal
- Direct links to original articles
- Source and timestamp information

## 🛠️ Setup & Usage

### Method 1: Simple File Opening
1. **Open `index.html`** directly in your browser
2. **Works immediately** - no server needed for basic functionality

### Method 2: Local Server (Recommended)
1. **Run the Python server**:
   ```bash
   cd news-dashboard
   python server.py
   ```
2. **Open browser** to `http://localhost:8080`
3. **Better CORS support** for extension integration

### Method 3: Live Server (VS Code)
1. **Install Live Server extension** in VS Code
2. **Right-click `index.html`** → "Open with Live Server"
3. **Automatic refresh** when you make changes

## 🔗 Chrome Extension Integration

The dashboard automatically syncs with your Chrome extension:

1. **Fetch articles** in the extension
2. **Articles appear** in the dashboard automatically
3. **Click "📊 Open Dashboard"** button in extension popup
4. **View history** of all your summarized articles

## 📊 Dashboard Features

### Search & Filtering
- **Search**: Find articles by title, summary, or source
- **Source Filter**: Filter by BBC, NPR, New York Times, NBC News, Fox News
- **Date Filter**: Today, This Week, This Month, All Time
- **Category Filter**: US News, World News, Technology

### Statistics
- **Total Articles**: Count of all saved articles
- **Today's Articles**: Articles fetched today
- **Unique Sources**: Number of different news sources

### Export Options
- **JSON**: Raw data for developers
- **CSV**: Spreadsheet-compatible format
- **HTML**: Formatted report for sharing

## 💾 Data Storage

- **Local Storage**: Articles stored in browser's localStorage
- **No Server Required**: All data stays on your device
- **Privacy First**: No data sent to external servers
- **Cross-Browser**: Works in Chrome, Firefox, Safari, Edge

## 🎨 Customization

### Styling
- Edit `styles.css` to customize colors and layout
- Modern CSS with gradients and blur effects
- Fully responsive design

### Functionality
- Modify `script.js` to add new features
- Easy to extend with additional filters
- Modular code structure

## 🔧 Technical Details

### File Structure
```
news-dashboard/
├── index.html          # Main dashboard page
├── styles.css          # Styling and layout
├── script.js           # Dashboard functionality
├── server.py           # Optional local server
└── README.md           # This file
```

### Browser Compatibility
- **Chrome**: Full support (recommended)
- **Firefox**: Full support
- **Safari**: Full support
- **Edge**: Full support
- **Mobile**: Responsive design works on all devices

### Performance
- **Fast Loading**: Minimal dependencies
- **Efficient Filtering**: Client-side search and filtering
- **Smooth Animations**: CSS transitions and transforms
- **Memory Efficient**: Optimized for large article collections

## 🚀 Advanced Usage

### Keyboard Shortcuts
- **Ctrl+F**: Focus search input
- **Escape**: Close modal dialogs

### URL Parameters
- Add `?search=term` to pre-fill search
- Add `?source=BBC` to pre-filter by source

### API Integration
The dashboard exposes a simple API for the Chrome extension:
```javascript
// Add article from extension
window.addNewsArticle({
    title: "Article Title",
    summary: "Article summary...",
    url: "https://example.com/article",
    source: "BBC",
    category: "us"
});
```

## 🔮 Future Enhancements

- **Cloud Sync**: Sync across devices
- **Article Recommendations**: AI-powered suggestions
- **Reading Time**: Estimate reading time for articles
- **Tags**: Custom tagging system
- **Dark Mode**: Toggle between light and dark themes
- **RSS Integration**: Direct RSS feed integration
- **Social Sharing**: Share articles on social media

## 🐛 Troubleshooting

### Articles Not Appearing
1. **Check extension**: Make sure Chrome extension is working
2. **Clear cache**: Refresh the dashboard page
3. **Check console**: Look for JavaScript errors (F12)

### Export Not Working
1. **Check browser**: Some browsers block downloads
2. **Allow popups**: Enable popups for the dashboard
3. **Try different format**: JSON usually works best

### Styling Issues
1. **Hard refresh**: Ctrl+F5 to reload CSS
2. **Check browser**: Update to latest version
3. **Disable extensions**: Other extensions might interfere

## 📄 License

This project is open source. Feel free to modify and distribute according to your needs.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Enjoy your personalized news dashboard! 📰✨**