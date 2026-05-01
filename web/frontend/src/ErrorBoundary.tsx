import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { error: Error | null };

/**
 * Top-level safety net for runtime React errors. Without this, an unhandled
 * render error blanks the screen. Catches rendering errors only — async
 * errors thrown from event handlers / effects need their own try/catch
 * (or react-query's error state).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background gap-4 p-4 text-grey-dark">
        <h2 className="text-[20px] font-semibold">Что-то пошло не так</h2>
        <p className="text-[14px] text-grey-medium">
          Перезагрузите страницу. Если ошибка повторяется — сообщите администратору.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-[8px] bg-purple-dark text-white px-6 py-[10px] text-[14px] font-medium hover:opacity-90"
        >
          Перезагрузить
        </button>
      </div>
    );
  }
}
