class NewsDashboard {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.init();
    }

    init() {
        this.loadArticles();
        this.setupEventListeners();
        this.updateStats();
        this.renderArticles();
    }

    setupEventListeners() {
        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterArticles();
        });

        document.getElementById('searchBtn').addEventListener('click', () => {
            this.filterArticles();
        });

        // Filter functionality
        document.getElementById('sourceFilter').addEventListener('change', () => {
            this.filterArticles();
        });

        document.getElementById('dateFilter').addEventListener('change', () => {
            this.filterArticles();
        });

        // Category filter commented out since news types are removed
        // document.getElementById('categoryFilter').addEventListener('change', () => {
        //     this.filterArticles();
        // });

        // Action buttons
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshFromExtension();
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearHistory();
        });

        // Export buttons
        document.getElementById('exportJsonBtn').addEventListener('click', () => {
            this.exportData('json');
        });

        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            this.exportData('csv');
        });

        document.getElementById('exportHtmlBtn').addEventListener('click', () => {
            this.exportData('html');
        });

        // Modal functionality
        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('articleModal').addEventListener('click', (e) => {
            if (e.target.id === 'articleModal') {
                this.closeModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                document.getElementById('searchInput').focus();
            }
        });
    }

    loadArticles() {
        try {
            const stored = localStorage.getItem('newsArticles');
            this.articles = stored ? JSON.parse(stored) : [];
            
            // Add sample data if no articles exist
            if (this.articles.length === 0) {
                this.addSampleData();
            }
            
            this.filteredArticles = [...this.articles];
        } catch (error) {
            console.error('Error loading articles:', error);
            this.articles = [];
            this.filteredArticles = [];
        }
    }

    addSampleData() {
        const sampleArticles = [
            {
                id: Date.now() + 1,
                title: "Breaking: Major Economic Policy Changes Announced",
                summary: "The Federal Reserve announced significant changes to monetary policy today, affecting interest rates and inflation targets. The new measures are expected to impact consumer spending and business investment across multiple sectors.",
                url: "https://www.bbc.com/news/business/economic-policy",
                source: "BBC",
                category: "us",
                timestamp: Date.now() - 3600000, // 1 hour ago
                dateAdded: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: Date.now() + 2,
                title: "International Climate Summit Reaches Historic Agreement",
                summary: "World leaders at the international climate summit have reached a groundbreaking agreement on carbon emission reductions. The pact includes binding commitments from major economies to achieve net-zero emissions by 2050.",
                url: "https://www.bbc.com/news/world-climate-summit",
                source: "BBC",
                category: "world",
                timestamp: Date.now() - 7200000, // 2 hours ago
                dateAdded: new Date(Date.now() - 7200000).toISOString()
            },
            {
                id: Date.now() + 3,
                title: "Revolutionary AI Breakthrough in Medical Diagnosis",
                summary: "Researchers have developed an AI system that can diagnose rare diseases with 95% accuracy, significantly outperforming traditional diagnostic methods. The technology uses advanced machine learning algorithms to analyze medical imaging and patient data.",
                url: "https://www.npr.org/sections/technology/ai-medical-breakthrough",
                source: "NPR",
                category: "tech",
                timestamp: Date.now() - 10800000, // 3 hours ago
                dateAdded: new Date(Date.now() - 10800000).toISOString()
            }
        ];

        this.articles = sampleArticles;
        this.saveArticles();
    }

    saveArticles() {
        try {
            localStorage.setItem('newsArticles', JSON.stringify(this.articles));
        } catch (error) {
            console.error('Error saving articles:', error);
        }
    }

    addArticle(article) {
        const newArticle = {
            id: Date.now(),
            ...article,
            timestamp: Date.now(),
            dateAdded: new Date().toISOString()
        };

        // Check for duplicates
        const exists = this.articles.some(a => a.url === article.url);
        if (!exists) {
            this.articles.unshift(newArticle);
            this.saveArticles();
            this.filterArticles();
            this.updateStats();
            return true;
        }
        return false;
    }

    filterArticles() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const sourceFilter = document.getElementById('sourceFilter').value;
        const dateFilter = document.getElementById('dateFilter').value;
        // Category filter removed since news types are no longer used
        const categoryFilter = '';

        this.filteredArticles = this.articles.filter(article => {
            // Search filter
            const matchesSearch = !searchTerm || 
                article.title.toLowerCase().includes(searchTerm) ||
                article.summary.toLowerCase().includes(searchTerm) ||
                article.source.toLowerCase().includes(searchTerm);

            // Source filter
            const matchesSource = !sourceFilter || article.source === sourceFilter;

            // Category filter
            const matchesCategory = !categoryFilter || article.category === categoryFilter;

            // Date filter
            let matchesDate = true;
            if (dateFilter) {
                const articleDate = new Date(article.timestamp);
                const now = new Date();
                
                switch (dateFilter) {
                    case 'today':
                        matchesDate = articleDate.toDateString() === now.toDateString();
                        break;
                    case 'week':
                        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        matchesDate = articleDate >= weekAgo;
                        break;
                    case 'month':
                        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        matchesDate = articleDate >= monthAgo;
                        break;
                }
            }

            return matchesSearch && matchesSource && matchesCategory && matchesDate;
        });

        this.renderArticles();
    }

    renderArticles() {
        const container = document.getElementById('articlesContainer');
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');

        // Hide loading state
        loadingState.style.display = 'none';

        if (this.filteredArticles.length === 0) {
            emptyState.style.display = 'block';
            // Remove existing articles
            const existingArticles = container.querySelectorAll('.article-card');
            existingArticles.forEach(card => card.remove());
            return;
        }

        emptyState.style.display = 'none';

        // Clear existing articles
        const existingArticles = container.querySelectorAll('.article-card');
        existingArticles.forEach(card => card.remove());

        // Render filtered articles
        this.filteredArticles.forEach(article => {
            const articleElement = this.createArticleElement(article);
            container.appendChild(articleElement);
        });
    }

    createArticleElement(article) {
        const articleDiv = document.createElement('div');
        articleDiv.className = 'article-card';
        articleDiv.onclick = () => this.openModal(article);

        const timeAgo = this.getTimeAgo(article.timestamp);
        
        articleDiv.innerHTML = `
            <div class="article-header">
                <h3 class="article-title">${article.title}</h3>
                <div class="article-meta">
                    <span class="source-badge">${article.source}</span>
                    <span class="date-text">${timeAgo}</span>
                </div>
            </div>
            <div class="article-summary">${article.summary}</div>
            <div class="article-actions">
                <a href="${this.validateUrl(article.url)}" target="_blank" class="read-more" onclick="event.stopPropagation()">
                    Read Full Article →
                </a>
            </div>
        `;

        return articleDiv;
    }

    openModal(article) {
        const modal = document.getElementById('articleModal');
        const title = document.getElementById('modalTitle');
        const source = document.getElementById('modalSource');
        const date = document.getElementById('modalDate');
        const summary = document.getElementById('modalSummary');
        const link = document.getElementById('modalLink');

        title.textContent = article.title;
        source.textContent = article.source;
        source.className = 'source-badge';
        date.textContent = this.getTimeAgo(article.timestamp);
        summary.textContent = article.summary;
        link.href = this.validateUrl(article.url);

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        const modal = document.getElementById('articleModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    updateStats() {
        const totalArticles = this.articles.length;
        const todayArticles = this.articles.filter(article => {
            const articleDate = new Date(article.timestamp);
            const today = new Date();
            return articleDate.toDateString() === today.toDateString();
        }).length;
        const uniqueSources = [...new Set(this.articles.map(a => a.source))].length;

        document.getElementById('totalArticles').textContent = totalArticles;
        document.getElementById('todayArticles').textContent = todayArticles;
        document.getElementById('uniqueSources').textContent = uniqueSources;
    }

    validateUrl(url) {
        // Check if URL is valid and accessible
        if (!url || url === '#' || !url.startsWith('http')) {
            console.warn('Invalid URL detected:', url);
            return '#'; // Return placeholder that won't navigate
        }
        return url;
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        
        return new Date(timestamp).toLocaleDateString();
    }

    refreshFromExtension() {
        // This would sync with the Chrome extension
        // For now, we'll simulate adding new articles
        const refreshBtn = document.getElementById('refreshBtn');
        const originalText = refreshBtn.innerHTML;
        
        refreshBtn.innerHTML = '<span class="icon">⏳</span> Syncing...';
        refreshBtn.disabled = true;

        // Simulate API call
        setTimeout(() => {
            // In a real implementation, this would fetch from the extension's storage
            console.log('Syncing with Chrome extension...');
            
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
            
            // Show success message
            this.showNotification('Synced with extension successfully!', 'success');
        }, 2000);
    }

    clearHistory() {
        if (confirm('Are you sure you want to clear all article history? This cannot be undone.')) {
            this.articles = [];
            this.filteredArticles = [];
            this.saveArticles();
            this.renderArticles();
            this.updateStats();
            this.showNotification('Article history cleared', 'info');
        }
    }

    exportData(format) {
        const data = this.filteredArticles.length > 0 ? this.filteredArticles : this.articles;
        
        switch (format) {
            case 'json':
                this.downloadFile(
                    JSON.stringify(data, null, 2),
                    'news-articles.json',
                    'application/json'
                );
                break;
            case 'csv':
                this.exportToCsv(data);
                break;
            case 'html':
                this.exportToHtml(data);
                break;
        }
    }

    exportToCsv(data) {
        const headers = ['Title', 'Summary', 'Source', 'Category', 'URL', 'Date'];
        const csvContent = [
            headers.join(','),
            ...data.map(article => [
                `"${article.title.replace(/"/g, '""')}"`,
                `"${article.summary.replace(/"/g, '""')}"`,
                article.source,
                article.category || '',
                article.url,
                new Date(article.timestamp).toISOString()
            ].join(','))
        ].join('\n');

        this.downloadFile(csvContent, 'news-articles.csv', 'text/csv');
    }

    exportToHtml(data) {
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>News Articles Export</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .article { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .title { color: #1a73e8; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 10px; }
        .summary { line-height: 1.6; margin-bottom: 10px; }
        .link { color: #1a73e8; text-decoration: none; }
    </style>
</head>
<body>
    <h1>News Articles Export</h1>
    <p>Exported on ${new Date().toLocaleString()}</p>
    ${data.map(article => `
        <div class="article">
            <div class="title">${article.title}</div>
            <div class="meta">${article.source} • ${new Date(article.timestamp).toLocaleString()}</div>
            <div class="summary">${article.summary}</div>
            <a href="${article.url}" class="link" target="_blank">Read Full Article</a>
        </div>
    `).join('')}
</body>
</html>`;

        this.downloadFile(htmlContent, 'news-articles.html', 'text/html');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification(`${filename} downloaded successfully!`, 'success');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            font-weight: 500;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new NewsDashboard();
});

// API for Chrome extension to add articles
window.addNewsArticle = function(article) {
    if (window.dashboard) {
        return window.dashboard.addArticle(article);
    }
    return false;
};

// Store dashboard instance globally for extension access
window.addEventListener('load', () => {
    window.dashboard = new NewsDashboard();
});