import type { Severity } from "../types";

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Get severity color for HTML styling
 */
export function getSeverityColor(severity: Severity): string {
    switch (severity) {
        case "CRITICAL":
            return "#ff4444";
        case "HIGH":
            return "#ff9800";
        case "MEDIUM":
            return "#ffc107";
        case "LOW":
            return "#2196f3";
        default:
            return "#999999";
    }
}

/**
 * Get severity icon emoji
 */
export function getSeverityIcon(severity: Severity): string {
    switch (severity) {
        case "CRITICAL":
            return "🔴";
        case "HIGH":
            return "🟠";
        case "MEDIUM":
            return "🟡";
        case "LOW":
            return "🔵";
        default:
            return "⭕";
    }
}

/**
 * HTML template styles
 */
export const HTML_STYLES = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
      color: #e0e0e0;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    header {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      border-left: 5px solid #4CAF50;
      backdrop-filter: blur(10px);
    }
    
    h1 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 2.5em;
      margin-bottom: 15px;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .timestamp {
      color: #999;
      font-size: 0.9em;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    
    .summary-card {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 20px;
      border-left: 4px solid #999;
      backdrop-filter: blur(10px);
    }
    
    .summary-card.critical {
      border-left-color: #ff4444;
    }
    
    .summary-card.high {
      border-left-color: #ff9800;
    }
    
    .summary-card.medium {
      border-left-color: #ffc107;
    }
    
    .summary-card.low {
      border-left-color: #2196f3;
    }
    
    .card-label {
      color: #999;
      font-size: 0.85em;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .card-value {
      font-size: 2em;
      font-weight: bold;
      color: #fff;
    }
    
    .targets-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 30px;
      backdrop-filter: blur(10px);
    }
    
    .targets-section h2 {
      font-size: 1.3em;
      margin-bottom: 15px;
      color: #4CAF50;
    }
    
    .target {
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
      margin: 8px 0;
      border-radius: 6px;
      border-left: 3px solid #4CAF50;
    }
    
    .findings-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 25px;
      backdrop-filter: blur(10px);
      overflow-x: auto;
    }
    
    .findings-section h2 {
      font-size: 1.3em;
      margin-bottom: 15px;
      color: #4CAF50;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    
    th {
      background: rgba(76, 175, 80, 0.1);
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #4CAF50;
      color: #4CAF50;
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    tr:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
      white-space: nowrap;
    }
    
    .badge-critical {
      background: rgba(255, 68, 68, 0.2);
      color: #ff4444;
    }
    
    .badge-high {
      background: rgba(255, 152, 0, 0.2);
      color: #ff9800;
    }
    
    .badge-medium {
      background: rgba(255, 193, 7, 0.2);
      color: #ffc107;
    }
    
    .badge-low {
      background: rgba(33, 150, 243, 0.2);
      color: #2196f3;
    }
    
    .file {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      color: #a3d977;
    }
    
    .no-findings {
      text-align: center;
      padding: 40px 12px !important;
      color: #4CAF50;
      font-weight: 600;
    }
    
    footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 0.85em;
      margin-top: 40px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
`;
