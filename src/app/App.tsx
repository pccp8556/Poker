import { Component, useEffect, type ReactNode } from 'react';
import { HistoryScreen } from '../ui/screens/History';
import { HomeScreen } from '../ui/screens/Home';
import { RangesScreen } from '../ui/screens/Ranges';
import { RangeViewScreen } from '../ui/screens/RangeView';
import { ResultsScreen } from '../ui/screens/Results';
import { SessionScreen } from '../ui/screens/Session';
import { SettingsScreen } from '../ui/screens/Settings';
import { StatsScreen } from '../ui/screens/Stats';
import { ToastHost } from '../ui/components/common';
import { IconChart, IconClock, IconGrid, IconHome, IconSettings } from '../ui/icons';
import { navigate, useRoute } from './router';
import { useStore } from './store';
import { reviewQueue } from '../domain/stats';

const TABS = [
  { path: '/', label: 'Accueil', icon: IconHome },
  { path: '/ranges', label: 'Ranges', icon: IconGrid },
  { path: '/stats', label: 'Stats', icon: IconChart },
  { path: '/history', label: 'Historique', icon: IconClock },
  { path: '/settings', label: 'Réglages', icon: IconSettings },
];

function TabBar({ active }: { active: string }) {
  const library = useStore((s) => s.library);
  const progress = useStore((s) => s.data.progress);
  const due = library ? reviewQueue(library, progress, Date.now()).dueCount : 0;
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
          <Icon />
          {label}
          {path === '/history' && due > 0 && <span className="tab-dot num">{due > 99 ? '99+' : due}</span>}
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
    case 'ranges':
      return <RangesScreen />;
    case 'range':
      return <RangeViewScreen id={arg ?? ''} hand={arg2} />;
    case 'session':
      return <SessionScreen />;
    case 'results':
      return <ResultsScreen id={arg ?? ''} />;
    case 'stats':
      return <StatsScreen />;
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
              <p style={{ marginTop: 4 }}>Votre progression est enregistrée localement.</p>
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
  const tabPath = `/${top}`;
  const showTabs = TABS.some((t) => t.path === tabPath);

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
        <Screen key={route.path} parts={route.parts} />
        {showTabs && <TabBar active={tabPath} />}
        <ToastHost />
      </div>
    </ErrorBoundary>
  );
}
