import React from 'react'

interface State {
  error: Error | null
  generation: number
}

/**
 * Last line of defence against a white screen: any render error shows a branded,
 * accessible recovery page instead of an empty document.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, generation: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Production: forwarded to the error tracker with no PII (Book 4, Rule 8).
    console.error('Batch site render error', error, info.componentStack)
  }

  reset = () => {
    // Remount the app from scratch so the state that crashed is discarded.
    this.setState((s) => ({ error: null, generation: s.generation + 1 }))
    try {
      window.history.replaceState(null, '', '#/')
    } catch {
      /* ignore */
    }
  }

  render() {
    if (!this.state.error) return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-graphite sm:px-8">
        <p className="font-serif text-xl font-semibold text-burgundy">Bodylia</p>
        <h1 tabIndex={-1} className="mt-8 font-serif text-4xl font-semibold leading-tight text-burgundy">
          Something went wrong on this page
        </h1>
        <p className="mt-4 text-lg">
          Your pack hasn’t been judged either way. Go back to the batch check and try again — if it keeps happening,
          email <a href="mailto:care@bodylia.in" className="font-semibold text-burgundy underline underline-offset-4">care@bodylia.in</a>.
        </p>
        <button
          onClick={this.reset}
          className="mt-8 inline-flex min-h-12 items-center rounded-md bg-burgundy px-6 font-semibold text-white hover:bg-burgundy-hover"
        >
          Back to the batch check
        </button>
      </main>
    )
  }
}
