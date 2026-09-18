/**
 * LinkedIn Unicode Beautifier Utility
 * 
 * Since LinkedIn's feed does not support Markdown (**bold** / *italic*),
 * these utilities convert standard ASCII text into Mathematical Alphanumeric Unicode symbols
 * that render in bold and italic natively across all LinkedIn mobile and desktop apps.
 */

// Mapping ASCII characters to Mathematical Sans-Serif Bold Unicode characters
export function toUnicodeBold(text: string): string {
  return text.replace(/[A-Za-z0-9]/g, (char) => {
    const code = char.charCodeAt(0);
    // A-Z -> 𝗔-𝗭 (U+1D5D4 to U+1D5ED)
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint(0x1d5d4 + (code - 65));
    }
    // a-z -> 𝗮-𝘇 (U+1D5EE to U+1D607)
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint(0x1d5ee + (code - 97));
    }
    // 0-9 -> 𝟬-𝟵 (U+1D7EC to U+1D7F5)
    if (code >= 48 && code <= 57) {
      return String.fromCodePoint(0x1d7ec + (code - 48));
    }
    return char;
  });
}

// Mapping ASCII characters to Mathematical Sans-Serif Italic Unicode characters
export function toUnicodeItalic(text: string): string {
  return text.replace(/[A-Za-z]/g, (char) => {
    const code = char.charCodeAt(0);
    // A-Z -> 𝘈-𝘡 (U+1D608 to U+1D621)
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint(0x1d608 + (code - 65));
    }
    // a-z -> 𝘢-𝘻 (U+1D622 to U+1D63B)
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint(0x1d622 + (code - 97));
    }
    return char;
  });
}

// Revert Unicode bold/italic characters back to standard plain ASCII
export function toPlainText(text: string): string {
  let result = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (!codePoint) {
      result += char;
      continue;
    }
    // Bold Sans-Serif A-Z (0x1D5D4 - 0x1D5ED)
    if (codePoint >= 0x1d5d4 && codePoint <= 0x1d5ed) {
      result += String.fromCharCode(65 + (codePoint - 0x1d5d4));
    }
    // Bold Sans-Serif a-z (0x1D5EE - 0x1D607)
    else if (codePoint >= 0x1d5ee && codePoint <= 0x1d607) {
      result += String.fromCharCode(97 + (codePoint - 0x1d5ee));
    }
    // Bold Sans-Serif 0-9 (0x1D7EC - 0x1D7F5)
    else if (codePoint >= 0x1d7ec && codePoint <= 0x1d7f5) {
      result += String.fromCharCode(48 + (codePoint - 0x1d7ec));
    }
    // Italic Sans-Serif A-Z (0x1D608 - 0x1D621)
    else if (codePoint >= 0x1d608 && codePoint <= 0x1d621) {
      result += String.fromCharCode(65 + (codePoint - 0x1d608));
    }
    // Italic Sans-Serif a-z (0x1D622 - 0x1D63B)
    else if (codePoint >= 0x1d622 && codePoint <= 0x1d63b) {
      result += String.fromCharCode(97 + (codePoint - 0x1d622));
    }
    // Standard Serif Bold A-Z (0x1D400 - 0x1D419)
    else if (codePoint >= 0x1d400 && codePoint <= 0x1d419) {
      result += String.fromCharCode(65 + (codePoint - 0x1d400));
    }
    // Standard Serif Bold a-z (0x1D41A - 0x1D433)
    else if (codePoint >= 0x1d41a && codePoint <= 0x1d433) {
      result += String.fromCharCode(97 + (codePoint - 0x1d41a));
    }
    // Standard Serif Bold 0-9 (0x1D7CE - 0x1D7D7)
    else if (codePoint >= 0x1d7ce && codePoint <= 0x1d7d7) {
      result += String.fromCharCode(48 + (codePoint - 0x1d7ce));
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Intelligent Post Beautifier:
 * - Detects title hook (first 1-2 lines) and styles it with clean bold formatting.
 * - Converts markdown **bold** into real Unicode bold.
 * - Converts numbers like "1.", "2." into bold numbers ("𝟭.", "𝟮.").
 * - Converts plain dashes / asterisks ("- ", "* ") into aesthetic bullet symbols ("✦ " or "▸ ").
 * - Replaces plain colon headers with bold labels (e.g. "Playbook:" -> "𝗣𝗹𝗮𝘆𝗯𝗼𝗼𝗸:").
 * - Ensures clean double-spacing between paragraphs for high dwell time.
 * - Nicely formats the bottom CTA and hashtags.
 */
export function beautifyLinkedInPost(content: string): string {
  if (!content || !content.trim()) return content;

  // 1. First convert any markdown **bold** tags to real Unicode bold
  let text = content.replace(/\*\*(.*?)\*\*/g, (_, p1) => toUnicodeBold(p1));

  // 2. Also convert markdown *italic* tags to real Unicode italic
  text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, (_, p1) => toUnicodeItalic(p1));

  // 3. Process line by line
  const rawLines = text.split('\n');
  const formattedLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      formattedLines.push('');
      continue;
    }

    // A. Boldify numbered lists: e.g. "1. " -> "𝟭. ", "2. " -> "𝟮. "
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const num = numMatch[1];
      const rest = numMatch[2];
      const boldNum = toUnicodeBold(num);

      // Check if the item has a label prefix e.g. "1. WhatsApp Direct: Verified..."
      const colonMatch = rest.match(/^([^:]+):\s*(.*)$/);
      if (colonMatch) {
        const label = colonMatch[1];
        const description = colonMatch[2];
        line = `${boldNum}. ${toUnicodeBold(label)}: ${description}`;
      } else {
        line = `${boldNum}. ${rest}`;
      }
      formattedLines.push(line);
      continue;
    }

    // B. Aesthetic bullets: e.g. "- ", "* ", "• "
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      const rest = bulletMatch[1];
      const colonMatch = rest.match(/^([^:]+):\s*(.*)$/);
      if (colonMatch) {
        const label = colonMatch[1];
        const description = colonMatch[2];
        line = `✦ ${toUnicodeBold(label)}: ${description}`;
      } else {
        line = `✦ ${rest}`;
      }
      formattedLines.push(line);
      continue;
    }

    // C. First non-empty line (Hook): If it's short and unformatted, boldify for authority
    if (formattedLines.filter((l) => l.trim()).length === 0 && trimmed.length < 90 && !trimmed.startsWith('#')) {
      line = toUnicodeBold(trimmed);
      formattedLines.push(line);
      continue;
    }

    // D. Section headers: e.g. "The Playbook:", "Here is what we changed:", "Why this matters:"
    const headerMatch = trimmed.match(/^(here is|why this|the framework|the 4-channel|the playbook|the result|key takeaways?|how it works|pro tip|unpopular opinion):?\s*$/i);
    if (headerMatch) {
      line = `▸ ${toUnicodeBold(trimmed.replace(/:$/, ''))}:`;
      formattedLines.push(line);
      continue;
    }

    // E. Label with colon: e.g. "Old way:" -> "𝗢𝗹𝗱 𝘄𝗮𝘆:"
    const colonLabelMatch = trimmed.match(/^(Old way|New way|Result|Before|After|Step \d|Lesson \d):\s*(.*)$/i);
    if (colonLabelMatch) {
      const label = colonLabelMatch[1];
      const rest = colonLabelMatch[2];
      line = `${toUnicodeBold(label)}: ${rest}`;
      formattedLines.push(line);
      continue;
    }

    formattedLines.push(line);
  }

  // 4. Ensure proper spacing between paragraphs (avoid consecutive 3+ empty lines)
  const cleanText = formattedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return cleanText;
}

/**
 * Apply styling to a selected range in a textarea
 */
export function applyStyleToSelection(
  fullText: string,
  selectionStart: number,
  selectionEnd: number,
  style: 'bold' | 'italic' | 'bullet' | 'number' | 'plain'
): { newText: string; newCursorStart: number; newCursorEnd: number } {
  if (selectionStart === selectionEnd) {
    // No text selected: insert a sample styled word or symbol
    if (style === 'bullet') {
      const insert = '✦ ';
      const newText = fullText.slice(0, selectionStart) + insert + fullText.slice(selectionEnd);
      return {
        newText,
        newCursorStart: selectionStart + insert.length,
        newCursorEnd: selectionStart + insert.length,
      };
    }
    if (style === 'bold') {
      const insert = toUnicodeBold('Headline');
      const newText = fullText.slice(0, selectionStart) + insert + fullText.slice(selectionEnd);
      return {
        newText,
        newCursorStart: selectionStart,
        newCursorEnd: selectionStart + insert.length,
      };
    }
    return { newText: fullText, newCursorStart: selectionStart, newCursorEnd: selectionEnd };
  }

  const selectedText = fullText.slice(selectionStart, selectionEnd);
  let transformed = selectedText;

  switch (style) {
    case 'bold':
      transformed = toUnicodeBold(toPlainText(selectedText));
      break;
    case 'italic':
      transformed = toUnicodeItalic(toPlainText(selectedText));
      break;
    case 'plain':
      transformed = toPlainText(selectedText);
      break;
    case 'bullet':
      transformed = selectedText
        .split('\n')
        .map((line) => (line.trim() ? `✦ ${line.replace(/^[-*•✦▸]\s*/, '')}` : line))
        .join('\n');
      break;
    case 'number': {
      let count = 1;
      transformed = selectedText
        .split('\n')
        .map((line) => {
          if (!line.trim()) return line;
          const num = toUnicodeBold(String(count++));
          return `${num}. ${line.replace(/^\d+[.)]\s*/, '')}`;
        })
        .join('\n');
      break;
    }
  }

  const newText = fullText.slice(0, selectionStart) + transformed + fullText.slice(selectionEnd);
  return {
    newText,
    newCursorStart: selectionStart,
    newCursorEnd: selectionStart + transformed.length,
  };
}
