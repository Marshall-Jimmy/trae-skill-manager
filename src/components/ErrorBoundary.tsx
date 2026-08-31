import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/** Catches render errors so a single bad card/panel can't blank the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-trae-bg text-trae-text p-6">
          <p className="text-sm font-medium">页面渲染出错</p>
          <p className="text-xs text-trae-text-secondary max-w-sm text-center break-all">
            {this.state.message}
          </p>
          <button
            onClick={this.handleReset}
            className="mt-2 text-xs text-trae-accent px-3 py-1.5 rounded-lg bg-trae-accent/10 border border-trae-accent/20 hover:bg-trae-accent/20 transition-colors"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
