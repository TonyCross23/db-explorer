export class ExplorerError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INVALID_QUERY' | 'DATABASE_UNAVAILABLE',
  ) {
    super(message);
  }
}
export class ResourceNotFoundError extends ExplorerError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
  }
}
export class InvalidQueryError extends ExplorerError {
  constructor(message: string) {
    super(message, 'INVALID_QUERY');
  }
}
export class DatabaseUnavailableError extends ExplorerError {
  constructor(
    message: string,
    public readonly reason?: string,
  ) {
    super(message, 'DATABASE_UNAVAILABLE');
  }
}
