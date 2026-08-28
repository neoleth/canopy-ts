/**
 * Network connection state: block height, endpoint health, and latency.
 *
 * Polling is deliberately gentle — one height query on an interval (default
 * 20s), paused whenever the tab is hidden, plus whatever the user triggers by
 * hand. Every successful call anywhere in the app also refreshes "last seen"
 * through the `onRpcSuccess` observer, so the indicator stays honest without
 * extra requests.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  describeError,
  getHeight,
  healthCheck,
  networkConfig,
  onRpcSuccess,
  pool,
} from "../lib/canopy";
import type { NetworkState, NodeHealth } from "../types/canopy";
import { useQuests } from "./useQuests";

const POLL_INTERVAL_MS = 20_000;

interface CanopyContextValue {
  network: NetworkState;
  nodes: NodeHealth[];
  nodesLoading: boolean;
  refresh: () => Promise<void>;
  checkNodes: () => Promise<void>;
  config: typeof networkConfig;
}

const CanopyContext = createContext<CanopyContextValue | null>(null);

export function CanopyProvider({ children }: { children: ReactNode }) {
  const { recordHeight } = useQuests();
  const [network, setNetwork] = useState<NetworkState>({
    status: "idle",
    height: null,
    endpoint: pool.currentNode().rpc,
    lastSuccessAt: null,
    latencyMs: null,
    error: null,
  });
  const [nodes, setNodes] = useState<NodeHealth[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const inFlight = useRef(false);

  // Any successful RPC anywhere updates the freshness indicator.
  useEffect(
    () =>
      onRpcSuccess((obs) => {
        setNetwork((current) => ({
          ...current,
          endpoint: obs.endpoint,
          latencyMs: obs.latencyMs,
          lastSuccessAt: obs.at,
        }));
      }),
    [],
  );

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setNetwork((current) => ({
      ...current,
      status: current.status === "connected" ? "connected" : "connecting",
    }));
    try {
      const height = await getHeight();
      setNetwork((current) => ({ ...current, status: "connected", height, error: null }));
      recordHeight(height);
    } catch (error) {
      setNetwork((current) => ({
        ...current,
        status: "error",
        error: describeError(error, "Unable to connect to Canopy network."),
      }));
    } finally {
      inFlight.current = false;
    }
  }, [recordHeight]);

  const checkNodes = useCallback(async () => {
    setNodesLoading(true);
    try {
      setNodes(await healthCheck());
    } catch (error) {
      describeError(error);
    } finally {
      setNodesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const value = useMemo<CanopyContextValue>(
    () => ({ network, nodes, nodesLoading, refresh, checkNodes, config: networkConfig }),
    [network, nodes, nodesLoading, refresh, checkNodes],
  );

  return <CanopyContext.Provider value={value}>{children}</CanopyContext.Provider>;
}

export function useCanopy(): CanopyContextValue {
  const ctx = useContext(CanopyContext);
  if (!ctx) throw new Error("useCanopy must be used inside <CanopyProvider>");
  return ctx;
}
