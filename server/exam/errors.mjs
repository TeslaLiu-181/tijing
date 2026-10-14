export class HTTPError extends Error {
  constructor(status, message, code = 'request_failed') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireCondition(condition, status, message, code) {
  if (!condition) throw new HTTPError(status, message, code);
}
