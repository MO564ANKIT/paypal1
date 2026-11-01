import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppHeader } from '@/components/layout/AppHeader';
import { BottomNav, type PageId } from '@/components/layout/BottomNav';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { DashboardPage } from '@/pages/DashboardPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { LootShopPage } from '@/pages/LootShopPage';
import { MoneyLabPage } from '@/pages/MoneyLabPage';
import { MonstersPage } from '@/pages/MonstersPage';
import { QuestsPage } from '@/pages/QuestsPage';
import { RoastChatPage } from '@/pages/RoastChatPage';
import { PaypalReturn } from '@/components/checkout/PaypalReturn';
import { Button } from '@/components/ui/Button';
import { AuthProvider } from '@/state/AuthProvider';
import { useAuth } from '@/state/authContext';
import { GameProvider } from '@/state/GameProvider';
import { useGame } from '@/state/gameContext';
import { loadPlayerState, type LoadedPlayerState } from '@/lib/persistence';
import { finalizeState } from '@/lib/progress';

function PageView({ page, onNavigate }: { page: PageId; onNavigate: (page: PageId) => void }) {
  switch (page) {
    case 'dashboard':
      return <DashboardPage onNavigate={onNavigate} />;
    case 'expenses':
      return <ExpensesPage />;
    case 'monsters':
      return <MonstersPage />;
    case 'quests':
      return <QuestsPage />;
    case 'lab':
      return <MoneyLabPage />;
    case 'shop':
      return <LootShopPage />;
    case 'roast':
      return <RoastChatPage />;
  }
}

function AppShell() {
  const [page, setPage] = useState<PageId>('dashboard');
  const { syncStatus } = useGame();

  const navigate = (next: PageId) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen text-ink-100">
      <AppHeader onNavigate={navigate} />
      {syncStatus !== 'ok' && (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-3 border-b border-rose-400/30 bg-rose-500/15 px-4 py-2 text-center text-sm text-rose-100">
          <p>
            {syncStatus === 'conflict'
              ? 'Your progress was updated in another tab or on another device, so changes here are paused to protect it.'
              : 'Your latest changes could not be saved. Check your connection; we will retry with your next change.'}
          </p>
          {syncStatus === 'conflict' && (
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          )}
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 pb-32 pt-8 sm:px-6 sm:pt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <PageView page={page} onNavigate={navigate} />
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav page={page} onNavigate={navigate} />
      <PaypalReturn />
    </div>
  );
}

function StatusScreen({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center text-ink-200" role="status">
      <p>{message}</p>
      {children}
    </div>
  );
}

function PlayerGame({ userId }: { userId: string }) {
  const [loaded, setLoaded] = useState<LoadedPlayerState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadPlayerState(userId, new Date()).then(
      (result) => {
        if (active) setLoaded({ ...result, state: finalizeState(result.state, new Date().toISOString()) });
      },
      (err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Your progress could not be loaded.');
      },
    );
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  if (loadError) {
    return (
      <StatusScreen message={loadError}>
        <Button
          variant="primary"
          onClick={() => {
            setLoadError(null);
            setAttempt((count) => count + 1);
          }}
        >
          Try again
        </Button>
      </StatusScreen>
    );
  }

  if (!loaded) return <StatusScreen message="Loading your progress..." />;

  return (
    <GameProvider userId={userId} initialState={loaded.state} initialVersion={loaded.version}>
      <AppShell />
    </GameProvider>
  );
}

function Root() {
  const { session, loading } = useAuth();
  if (loading) return <StatusScreen message="Loading..." />;
  if (!session) return <AuthScreen />;
  return <PlayerGame userId={session.user.id} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
