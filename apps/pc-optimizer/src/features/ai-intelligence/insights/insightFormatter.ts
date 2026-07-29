/**
 * Insight Formatter — formats insights for multiple output channels.
 *
 * Supports:
 *   Dashboard, Notification, Conversation, Report, Email,
 *   Mobile, Plain Text, Rich Text, Markdown
 */
import type { Insight, FormattedInsight, InsightOutputFormat, FormattingRules } from './types';

export class InsightFormatter {
  private _rules: FormattingRules;

  constructor(rules: FormattingRules) {
    this._rules = rules;
  }

  updateRules(rules: FormattingRules): void {
    this._rules = rules;
  }

  /**
   * Format an insight for a specific output channel.
   */
  format(insight: Insight, format: InsightOutputFormat): FormattedInsight {
    switch (format) {
      case 'dashboard':
        return this._formatDashboard(insight);
      case 'notification':
        return this._formatNotification(insight);
      case 'conversation':
        return this._formatConversation(insight);
      case 'report':
        return this._formatReport(insight);
      case 'email':
        return this._formatEmail(insight);
      case 'mobile':
        return this._formatMobile(insight);
      case 'plain_text':
        return this._formatPlainText(insight);
      case 'rich_text':
        return this._formatRichText(insight);
      case 'markdown':
        return this._formatMarkdown(insight);
      default:
        return this._formatPlainText(insight);
    }
  }

  /**
   * Format multiple insights.
   */
  formatAll(insights: Insight[], format: InsightOutputFormat): FormattedInsight[] {
    return insights.map((i) => this.format(i, format));
  }

  // ── Private formatters ─────────────────────────────────────

  private _formatDashboard(insight: Insight): FormattedInsight {
    const title = insight.title;
    const body = `${insight.subtitle}\n\n${insight.summary}`;
    return {
      insightId: insight.id,
      format: 'dashboard',
      title,
      body: this._truncate(body, this._rules.maxDescriptionLength),
      metadata: {
        priority: insight.priority,
        importance: insight.importanceScore,
        confidence: insight.confidenceScore,
        readingTime: insight.estimatedReadingTime,
        type: insight.type,
        category: insight.category,
      },
    };
  }

  private _formatNotification(insight: Insight): FormattedInsight {
    const title = insight.title;
    const body = this._truncate(insight.summary, this._rules.maxSummaryLength);
    return {
      insightId: insight.id,
      format: 'notification',
      title,
      body,
      metadata: {
        priority: insight.priority,
        type: insight.type,
      },
    };
  }

  private _formatConversation(insight: Insight): FormattedInsight {
    const title = insight.title;
    const body = `${insight.summary}\n\n${insight.description}`;
    return {
      insightId: insight.id,
      format: 'conversation',
      title,
      body: this._truncate(body, this._rules.maxDescriptionLength),
      metadata: {
        priority: insight.priority,
        confidence: insight.confidenceScore,
      },
    };
  }

  private _formatReport(insight: Insight): FormattedInsight {
    const title = insight.title;
    const lines: string[] = [
      `# ${insight.title}`,
      `**${insight.subtitle}**`,
      '',
      `**Category:** ${insight.category}`,
      `**Type:** ${insight.type}`,
      `**Priority:** ${insight.priority}`,
      `**Importance:** ${(insight.importanceScore * 100).toFixed(0)}%`,
      `**Confidence:** ${(insight.confidenceScore * 100).toFixed(0)}%`,
      '',
      '## Summary',
      insight.summary,
      '',
      '## Details',
      insight.description,
    ];

    if (this._rules.includeEvidence && insight.evidence.evidenceCount > 0) {
      lines.push('', '## Evidence', `Based on ${insight.evidence.evidenceCount} data points from ${insight.evidence.sourceProviders.length} providers.`);
    }

    if (this._rules.includeRecommendations && insight.relatedRecommendations.length > 0) {
      lines.push('', '## Related Recommendations', insight.relatedRecommendations.map((r) => `- ${r}`).join('\n'));
    }

    return {
      insightId: insight.id,
      format: 'report',
      title,
      body: lines.join('\n'),
      metadata: {
        priority: insight.priority,
        importance: insight.importanceScore,
        confidence: insight.confidenceScore,
        evidenceCount: insight.evidence.evidenceCount,
      },
    };
  }

  private _formatEmail(insight: Insight): FormattedInsight {
    const title = insight.title;
    const body = [
      `${insight.subtitle}`,
      '',
      insight.summary,
      '',
      insight.description,
      '',
      `Importance: ${(insight.importanceScore * 100).toFixed(0)}%`,
      `Confidence: ${(insight.confidenceScore * 100).toFixed(0)}%`,
    ].join('\n');
    return {
      insightId: insight.id,
      format: 'email',
      title,
      body,
      metadata: {
        priority: insight.priority,
        readingTime: insight.estimatedReadingTime,
      },
    };
  }

  private _formatMobile(insight: Insight): FormattedInsight {
    const title = this._truncate(insight.title, 50);
    const body = this._truncate(insight.summary, 150);
    return {
      insightId: insight.id,
      format: 'mobile',
      title,
      body,
      metadata: {
        priority: insight.priority,
        type: insight.type,
        readingTime: insight.estimatedReadingTime,
      },
    };
  }

  private _formatPlainText(insight: Insight): FormattedInsight {
    const title = insight.title;
    const body = `${insight.subtitle}\n\n${insight.summary}\n\n${insight.description}`;
    return {
      insightId: insight.id,
      format: 'plain_text',
      title,
      body,
      metadata: {},
    };
  }

  private _formatRichText(insight: Insight): FormattedInsight {
    const title = insight.title;
    const body = `<h3>${insight.title}</h3><p><em>${insight.subtitle}</em></p><p>${insight.summary}</p><p>${insight.description}</p>`;
    return {
      insightId: insight.id,
      format: 'rich_text',
      title,
      body,
      metadata: {
        priority: insight.priority,
        importance: insight.importanceScore,
      },
    };
  }

  private _formatMarkdown(insight: Insight): FormattedInsight {
    const title = insight.title;
    const lines: string[] = [
      `### ${insight.title}`,
      `*${insight.subtitle}*`,
      '',
      insight.summary,
      '',
      insight.description,
    ];

    if (insight.relatedRecommendations.length > 0) {
      lines.push('', '**Related:**', insight.relatedRecommendations.map((r) => `- ${r}`).join('\n'));
    }

    return {
      insightId: insight.id,
      format: 'markdown',
      title,
      body: lines.join('\n'),
      metadata: {
        priority: insight.priority,
        importance: insight.importanceScore,
        confidence: insight.confidenceScore,
      },
    };
  }

  private _truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 3) + '...';
  }
}
