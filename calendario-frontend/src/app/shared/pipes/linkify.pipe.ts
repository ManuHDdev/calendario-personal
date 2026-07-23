import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const TRAILING_PUNCTUATION = '.,)';

@Pipe({ name: 'linkify', standalone: true })
export class LinkifyPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';

    const escaped = this.escapeHtml(value);
    const linked = escaped.replace(URL_PATTERN, (match) => {
      let url = match;
      let trailing = '';
      while (url.length && TRAILING_PUNCTUATION.includes(url[url.length - 1])) {
        trailing = url[url.length - 1] + trailing;
        url = url.slice(0, -1);
      }
      const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(linked);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
