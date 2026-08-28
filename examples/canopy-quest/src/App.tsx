import { Component, type ErrorInfo, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { WalletProvider } from "./hooks/useWallet";
import { QuestProvider } from "./hooks/useQuests";
import { CanopyProvider } from "./hooks/useCanopy";
import { Dashboard } from "./pages/Dashboard";
import { Quests } from "./pages/Quests";
import { Wallet } from "./pages/Wallet";
import { Activity } from "./pages/Activity";
import { Validators } from "./pages/Validators";
import { LeaderboardPage } from "./pages/LeaderboardPage";

/** Keeps a render failure from blanking the app; the details stay in the console. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("canopy-quest: render error", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="content">
          <div className="alert alert-error">
            Something went wrong rendering this page. Reload to try again.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      {/* WalletProvider → QuestProvider → CanopyProvider: quests read the
          connected address, and network calls record quest evidence. */}
      <WalletProvider>
        <QuestProvider>
          <CanopyProvider>
            <HashRouter>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/quests" element={<Quests />} />
                  <Route path="/wallet" element={<Wallet />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/validators" element={<Validators />} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </HashRouter>
          </CanopyProvider>
        </QuestProvider>
      </WalletProvider>
    </ErrorBoundary>
  );
}
