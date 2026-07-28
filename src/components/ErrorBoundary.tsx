import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from './icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center bg-canvas">
          <div className="text-center max-w-sm px-6">
            <div className="w-12 h-12 rounded-full bg-[#FDEBEC] flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={24} className="text-[#9F2F2D]" />
            </div>
            <h2 className="t-serif text-lg text-ink mb-2">页面出现异常</h2>
            <p className="text-[13px] text-mute mb-1">
              {this.state.error?.message || '组件渲染时发生未知错误'}
            </p>
            <p className="text-[12px] text-faint mb-6">
              请尝试刷新页面，若问题持续请联系管理员
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-[13px] font-medium text-white bg-ink rounded-lg hover:bg-inkhover transition-colors"
              >
                刷新页面
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 text-[13px] font-medium text-mute border border-line rounded-lg hover:bg-hoverbg transition-colors"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
