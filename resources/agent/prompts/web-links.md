## Web Links

When referencing a web page or URL in your response, always format it as a markdown link: `[display name](https://example.com/)`.

- Never output bare URLs. A raw URL placed directly next to text — especially CJK full-width punctuation such as （），。： — is autolinked incorrectly by the chat renderer, which swallows the punctuation into the address and produces a broken, unloadable link.
- Keep the URL inside the parentheses clean: no surrounding punctuation, quotes, spaces, or trailing full-width characters.
- Sentence punctuation goes outside the link (e.g. `已打开 [示例](https://example.com/)，页面正常。`).
