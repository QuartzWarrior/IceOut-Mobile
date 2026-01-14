import React, { Component, ErrorInfo, ReactNode } from 'react';
import { IonContent, IonPage, IonHeader, IonToolbar, IonTitle, IonButton } from '@ionic/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <IonPage>
          <IonHeader>
            <IonToolbar color="danger">
              <IonTitle>Error</IonTitle>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <h2>⚠️ Something went wrong</h2>
              <p style={{ color: '#666', marginTop: '10px' }}>
                The app encountered an unexpected error. This has been logged.
              </p>
              {this.state.error && (
                <div style={{
                  background: '#f8f9fa',
                  padding: '15px',
                  borderRadius: '8px',
                  marginTop: '20px',
                  textAlign: 'left',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  overflow: 'auto'
                }}>
                  <strong>Error:</strong> {this.state.error.toString()}
                  {this.state.error.stack && (
                    <>
                      <br /><br />
                      <strong>Stack:</strong>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {this.state.error.stack}
                      </pre>
                    </>
                  )}
                </div>
              )}
              <IonButton
                expand="block"
                color="primary"
                onClick={this.handleReset}
                style={{ marginTop: '30px' }}
              >
                Reload App
              </IonButton>
            </div>
          </IonContent>
        </IonPage>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

