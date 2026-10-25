import { Component, useEffect, type ReactNode } from 'react';
import { CustomScreen } from '../ui/screens/Custom';
import { EditorScreen } from '../ui/screens/Editor';
import { ExplorerScreen } from '../ui/screens/Explorer';
import { HistoryScreen } from '../ui/screens/History';
import { HomeScreen } from '../ui/screens/Home';
import { MarginalScreen } from '../ui/screens/Marginal';
import { NewRangeScreen } from '../ui/screens/NewRange';
import { ProgressScreen } from '../ui/screens/Progress';
import { ResultsScreen } from '../ui/screens/Results';
import { SessionScreen } from '../ui/screens/Session';
import { SettingsScreen } from '../ui/screens/Settings';
import { TrainScreen } from '../ui/screens/Train';
import { ToastHost } from '../ui/components/common';
import { IconChart, IconGear, IconGrid, IconHome, IconTarget } from '../ui/icons';
import { navigate, useRoute } from './router';
import { useStore } from './store';

const TABS = [
  { path: '/', label: 'Accueil', icon: IconHome },
  { path: '/train', label: 'Entraîner', icon: IconTarget },
  { path: '/ranges', label: 'Ranges', icon: IconGrid },
  { path: '/progress', label: 'Progrès', icon: IconChart },
  { path: '/settings', label: 'Réglages', icon: IconGear },
];

function TabBar({ active }: { active: string }) {
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {TABS.map(({ path, label, icon: Icon }) => (
        <button
          key={path}
          type="button"
          className="tab"
          aria-current={active === path ? 'page' : undefined}
          onClick={() => {
            if (active === path) return window.scrollTo({ top: 0, behavior: 'smooth' });
            // Tabs replace each other so that "back" always returns home, then exits.
            navigate(path, { replace: active !== '/' });
          }}
        >
          <span className="tab-icon">
            <Icon />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

function Screen({ parts }: { parts: string[] }) {
  const [head, arg, arg2] = parts;
  switch (head) {
    case undefined:
      return <HomeScreen />;
    case 'train':
      return <TrainScreen />;
    case 'custom':
      return <CustomScreen />;
    case 'ranges':
    case 'range':
      return <ExplorerScreen id={arg} hand={arg2} />;
    case 'edit':
      return <EditorScreen id={arg ?? ''} />;
    case 'new':
      return <NewRangeScreen copyOf={arg} />;
    case 'marginal':
      return <MarginalScreen id={arg} />;
    case 'session':
      return <SessionScreen />;
    case 'results':
      return <ResultsScreen id={arg ?? ''} />;
    case 'progress':
    case 'stats':
      return <ProgressScreen />;
    case 'history':
      return <HistoryScreen tab={arg === 'review' ? 'review' : 'sessions'} />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <main className="screen no-nav">
          <div className="banner banner-error">
            <div>
              <strong>Une erreur inattendue est survenue.</strong>
              <p style={{ marginTop: 4 }}>{this.state.error.message}</p>
              <p style={{ marginTop: 4 }}>Ta progression est enregistrée localement.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 16 }}
            onClick={() => {
              window.location.hash = '/';
              window.location.reload();
            }}
          >
            Recharger l’application
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const route = useRoute();
  const top = route.parts[0] ?? '';
  const tabPath = top === 'stats' ? '/progress' : top === 'range' ? '/ranges' : `/${top}`;
  const showTabs = TABS.some((t) => t.path === tabPath) || top === 'history';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  if (status === 'loading') {
    return (
      <div className="boot" role="status">
        <div className="boot-mark" />
        <p>Chargement…</p>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <main className="screen no-nav">
        <div className="banner banner-error">
          <div>
            <strong>Les données de ranges sont invalides.</strong>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8 }}>{error}</pre>
          </div>
        </div>
      </main>
    );
  }
  return (
    <ErrorBoundary>
      <div className="app">
        <Screen key={route.parts.slice(0, 1).join('/') + (top === 'edit' || top === 'results' ? route.path : '')} parts={route.parts} />
        {showTabs && <TabBar active={top === 'history' ? '/progress' : tabPath} />}
        <ToastHost />
      </div>
    </ErrorBoundary>
  );
}
