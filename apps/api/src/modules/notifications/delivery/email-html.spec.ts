import { describe, expect, it } from 'vitest';
import { emailHtml } from './email-html.js';

describe('emailHtml', () => {
  it('turns a line that is only a link into a button, and keeps the other words', () => {
    const html = emailHtml('Reset your password', 'Choose a new password here:\nhttps://app.example.test/reset-password#token=abc\n\nIgnore it otherwise.');
    expect(html).toContain('<title>Reset your password</title>');
    expect(html).toContain('<p style="margin:0 0 16px">Choose a new password here:</p>');
    expect(html).toContain('href="https://app.example.test/reset-password#token=abc"');
    expect(html).toContain('Open SHC</a>');
    expect(html).toContain('Ignore it otherwise.');
  });

  it('links addresses inside a sentence', () => {
    expect(emailHtml('s', 'Open SHC for details: https://app.example.test')).toContain(
      'Open SHC for details: <a href="https://app.example.test" style="color:#0f766e;word-break:break-all">https://app.example.test</a>',
    );
  });

  it('escapes everything, so text can never become markup', () => {
    const html = emailHtml('<b>x</b>', 'Hello <script>alert(1)</script> & "you"\nhttps://a.test/?q="><img src=x>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;you&quot;');
    expect(html).toContain('<title>&lt;b&gt;x&lt;/b&gt;</title>');
  });

  it('adds nothing beyond the text but the brand header and the automated-message footer', () => {
    const visible = emailHtml('s', 'One line.').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(visible).toBe('s SHC One line. SHC · This is an automated message; replies aren’t read.');
  });
});
