export function encodeMcpMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

export function decodeMcpMessages(buffer) {
  const messages = [];
  let remaining = buffer;

  while (true) {
    const headerEnd = remaining.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const headerBlock = remaining.slice(0, headerEnd);
    const contentLengthLine = headerBlock.split(/\r\n/).find(line => /^Content-Length:/i.test(line));
    if (!contentLengthLine) break;

    const contentLength = Number(contentLengthLine.split(':')[1].trim());
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;
    if (remaining.length < bodyEnd) break;

    const body = remaining.slice(bodyStart, bodyEnd);
    try {
      messages.push(JSON.parse(body));
    } catch {
      // ignore malformed packets
    }

    remaining = remaining.slice(bodyEnd);
  }

  return { messages, remaining };
}

export function createRequest(id, method, params = {}) {
  return { jsonrpc: '2.0', id, method, params };
}

export function createNotification(method, params = {}) {
  return { jsonrpc: '2.0', method, params };
}