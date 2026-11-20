// If drawing the app ever fails, show a way out instead of a blank page: undo the last change
// (the usual cause is the data it just made) or reload.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useStore } from '../store';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Kairos crashed while drawing', error, info.componentStack);
  }

  private undo = () => {
    useStore.getState().undo();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const canUndo = useStore.getState().past.length > 0;
    return (
      <div className="crash" role="alert">
        <h2>Something went wrong</h2>
        <p className="muted">Your data is still saved. Undo the last change, or reload the page.</p>
        <p className="muted small">
          <code>{error.message}</code>
        </p>
        <div className="crash-buttons">
          {canUndo && (
            <button className="btn primary" onClick={this.undo}>
              Undo last change
            </button>
          )}
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
