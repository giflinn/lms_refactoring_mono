/// Thrown when the request never reaches the server (no network, server down,
/// wrong API_URL on a real device). Pages catch this to show a clear "проверьте
/// соединение" message instead of a generic error.
class NetworkException implements Exception {
  const NetworkException();
}
