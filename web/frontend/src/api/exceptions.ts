/**
 * Thrown when the request never reaches the server (no network, server down,
 * CORS blocked, wrong VITE_API_URL). Pages catch this to render a clear
 * "проверьте соединение" message instead of a generic error.
 */
export class NetworkException extends Error {
  constructor() {
    super("network_error");
    this.name = "NetworkException";
  }
}
