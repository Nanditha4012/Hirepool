export class ApiError extends Error {
  statusCode: number;

  /**
   * Optional machine-readable tag, echoed to the client by errorHandler.
   *
   * Exists because some failures need the frontend to *do* something specific
   * rather than just print the message — the verification gate's 403 has to
   * send the user to their status page, and that is not something a UI can
   * safely infer from prose. Everything else leaves this unset and the
   * response body is unchanged.
   */
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message = 'Bad request', code?: string): ApiError {
    return new ApiError(400, message, code);
  }

  static unauthorized(message = 'Unauthorized', code?: string): ApiError {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code?: string): ApiError {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict'): ApiError {
    return new ApiError(409, message);
  }

  static paymentRequired(message = 'Payment required'): ApiError {
    return new ApiError(402, message);
  }

  /**
   * Added for the contest code runner: the public Piston instance rate-limits
   * us, and that has to reach the candidate as "wait a moment" rather than as
   * a generic failure they'd read as their program being wrong.
   */
  static tooManyRequests(message = 'Too many requests'): ApiError {
    return new ApiError(429, message);
  }

  static serviceUnavailable(message = 'Service unavailable'): ApiError {
    return new ApiError(503, message);
  }
}
