#!/usr/bin/env python3
"""
Simple HTTP server for the News Dashboard
Run this to serve the dashboard locally
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers to allow extension access
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def main():
    # Change to the dashboard directory
    dashboard_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(dashboard_dir)
    
    # Create server
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"📰 News Dashboard Server")
        print(f"🌐 Serving at: http://localhost:{PORT}")
        print(f"📁 Directory: {dashboard_dir}")
        print(f"🔗 Open in browser: http://localhost:{PORT}")
        print(f"⏹️  Press Ctrl+C to stop")
        
        # Try to open browser automatically
        try:
            webbrowser.open(f'http://localhost:{PORT}')
        except:
            pass
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n🛑 Server stopped")
            sys.exit(0)

if __name__ == "__main__":
    main()