import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-serif-luxury text-white mb-2">Ups, wystąpił problem</h1>
          <p className="text-[#AAA69D] max-w-md mb-8">
            Napotkaliśmy nieoczekiwany błąd podczas renderowania aplikacji. 
            Twoje zmiany powinny być bezpieczne w lokalnej pamięci.
          </p>
          
          <div className="bg-[#121212] border border-[#2A2824] rounded-xl p-4 max-w-lg w-full text-left mb-8 overflow-auto max-h-32">
            <p className="text-xs font-mono text-red-400">
              {this.state.error?.message || 'Nieznany błąd wewnętrzny.'}
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="bg-[#D4AF37] text-black px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-[#FDE047] transition-all shadow-[0_0_15px_rgba(212,175,55,0.2)]"
          >
            <RefreshCw className="w-4 h-4" />
            Odśwież aplikację
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
