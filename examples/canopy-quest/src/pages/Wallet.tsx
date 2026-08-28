import { useState } from "react";
import {
  Download,
  KeyRound,
  Lock,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  Unlock,
  Upload,
} from "lucide-react";
import { WalletCard } from "../components/WalletCard";
import { TransactionModal } from "../components/TransactionModal";
import { Card } from "../components/ui";
import { CopyButton } from "../components/CopyButton";
import { useWallet } from "../hooks/useWallet";
import { curveLabel, exportKeystoreEntry } from "../lib/wallet";
import { describeError } from "../lib/canopy";
import { shortenAddress } from "../lib/format";
import type { ParsedKeystoreEntry } from "@canopynetwork/canopy-ts/keystore";

type Mode = "create" | "unlock" | "import";

export function Wallet() {
  const { session, wallets, unlock, createWallet, importKey, importKeystore, forget, lock } =
    useWallet();

  const [mode, setMode] = useState<Mode>(wallets.length > 0 ? "unlock" : "create");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selected, setSelected] = useState(wallets[0]?.address ?? "");
  const [privateKey, setPrivateKey] = useState("");
  const [keystoreJson, setKeystoreJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [backup, setBackup] = useState<ParsedKeystoreEntry | null>(null);
  const [backupRevealed, setBackupRevealed] = useState(false);
  const [sending, setSending] = useState(false);

  const reset = () => {
    setPassword("");
    setConfirmPassword("");
    setPrivateKey("");
    setKeystoreJson("");
  };

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e, "That did not work."));
    } finally {
      setBusy(false);
    }
  };

  const onCreate = () =>
    run(async () => {
      if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
      if (password !== confirmPassword) throw new Error("The two passwords do not match.");
      const entry = await createWallet(nickname, password);
      setBackup(entry);
      setBackupRevealed(false);
      reset();
    });

  const onUnlock = () =>
    run(async () => {
      if (!selected) throw new Error("Choose a wallet to unlock.");
      await unlock(selected, password);
      reset();
    });

  const onImportKey = () =>
    run(async () => {
      if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
      await importKey({ privateKeyHex: privateKey, password, nickname });
      reset();
      setNotice("Key imported and encrypted locally.");
    });

  const onImportKeystore = () =>
    run(() => {
      const summary = importKeystore(keystoreJson);
      setSelected(summary.address);
      setMode("unlock");
      reset();
      setNotice(`Imported ${shortenAddress(summary.address, 6)}. Unlock it with its password.`);
    });

  const downloadBackup = (entry: ParsedKeystoreEntry) => {
    const blob = new Blob([JSON.stringify(entry, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `canopy-quest-${entry.address.slice(0, 8)}.keystore.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onExport = (address: string) =>
    run(async () => {
      const entryPassword = window.prompt("Wallet password (used to decrypt for re-encryption):");
      if (!entryPassword) return;
      const entry = await exportKeystoreEntry(address, entryPassword, entryPassword);
      downloadBackup(entry);
      setNotice("Encrypted keystore downloaded. It is useless without your password.");
    });

  return (
    <>
      <div className="page-head">
        <h1>Wallet</h1>
        <p>Keys are generated, encrypted, and signed with locally. Nothing is ever sent to a server.</p>
      </div>

      <div className="grid grid-2">
        <div className="col" style={{ gap: 16 }}>
          <WalletCard showFull />

          {session && (
            <Card title="Actions" icon={<Send size={16} />}>
              <div className="col" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary btn-block" onClick={() => setSending(true)}>
                  <Send size={14} />
                  Send tokens
                </button>
                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => void onExport(session.address)}
                  disabled={busy}
                >
                  <Download size={14} />
                  Download encrypted backup
                </button>
                <button type="button" className="btn btn-block" onClick={lock}>
                  <Lock size={14} />
                  Lock wallet
                </button>
              </div>
            </Card>
          )}

          <Card title="Security" icon={<ShieldAlert size={16} />}>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Private keys are encrypted with argon2i + AES-GCM before they touch storage.</li>
              <li>The decrypted key exists only in this tab's memory until you lock or close it.</li>
              <li>This app never displays, logs, or transmits a private key — only signed transactions.</li>
              <li>Back up the encrypted keystore file. Lose the password and the wallet is gone.</li>
              <li>This is demo software: do not use it to hold funds you care about.</li>
            </ul>
          </Card>
        </div>

        <div className="col" style={{ gap: 16 }}>
          {backup && (
            <Card title="Back up your new wallet" icon={<ShieldAlert size={16} />}>
              <div className="col" style={{ gap: 12 }}>
                <div className="alert alert-warn">
                  This encrypted keystore is the only copy of your key. Download it now and store it
                  somewhere safe — it can only be opened with the password you just chose.
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={() => downloadBackup(backup)}>
                    <Download size={14} />
                    Download keystore
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setBackupRevealed((value) => !value)}
                  >
                    {backupRevealed ? "Hide" : "Show"} encrypted JSON
                  </button>
                </div>
                {backupRevealed && (
                  <pre
                    className="mono small"
                    style={{ margin: 0, overflowX: "auto", background: "rgba(0,0,0,0.35)", padding: 12, borderRadius: 10 }}
                  >
                    {JSON.stringify(backup, null, 2)}
                  </pre>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBackup(null)}>
                  I have saved it
                </button>
              </div>
            </Card>
          )}

          <Card title={session ? "Switch or add a wallet" : "Get started"} icon={<KeyRound size={16} />}>
            <div className="col" style={{ gap: 14 }}>
              <div className="row" style={{ gap: 8 }}>
                {(["create", "unlock", "import"] as Mode[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={mode === value ? "btn btn-primary btn-sm" : "btn btn-sm"}
                    onClick={() => {
                      setMode(value);
                      setError(null);
                    }}
                  >
                    {value === "create" ? "Create" : value === "unlock" ? "Unlock" : "Import"}
                  </button>
                ))}
              </div>

              {mode === "create" && (
                <div className="col" style={{ gap: 12 }}>
                  <div className="field">
                    <label htmlFor="w-nick">Nickname</label>
                    <input
                      id="w-nick"
                      className="input"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="My Canopy wallet"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="w-pass">Password</label>
                    <input
                      id="w-pass"
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="w-pass2">Confirm password</label>
                    <input
                      id="w-pass2"
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => void onCreate()}
                    disabled={busy}
                  >
                    <Plus size={14} />
                    {busy ? "Creating…" : "Create wallet"}
                  </button>
                </div>
              )}

              {mode === "unlock" && (
                <div className="col" style={{ gap: 12 }}>
                  {wallets.length === 0 ? (
                    <p className="muted small">No wallets stored in this browser yet.</p>
                  ) : (
                    <>
                      <div className="field">
                        <label htmlFor="w-select">Wallet</label>
                        <select
                          id="w-select"
                          className="select"
                          value={selected}
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          {wallets.map((wallet) => (
                            <option key={wallet.address} value={wallet.address}>
                              {wallet.nickname ? `${wallet.nickname} — ` : ""}
                              {shortenAddress(wallet.address, 8)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="w-unlock-pass">Password</label>
                        <input
                          id="w-unlock-pass"
                          className="input"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        onClick={() => void onUnlock()}
                        disabled={busy}
                      >
                        <Unlock size={14} />
                        {busy ? "Unlocking…" : "Unlock"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {mode === "import" && (
                <div className="col" style={{ gap: 16 }}>
                  <div className="col" style={{ gap: 12 }}>
                    <span className="stat-label">From private key</span>
                    <div className="field">
                      <label htmlFor="w-pk">Private key (hex)</label>
                      <input
                        id="w-pk"
                        className="input mono"
                        type="password"
                        autoComplete="off"
                        placeholder="64 hex characters"
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                      />
                      <span className="hint">
                        Encrypted immediately with the password below; never stored in the clear.
                      </span>
                    </div>
                    <div className="field">
                      <label htmlFor="w-imp-pass">Encryption password</label>
                      <input
                        id="w-imp-pass"
                        className="input"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-block"
                      onClick={() => void onImportKey()}
                      disabled={busy}
                    >
                      <Upload size={14} />
                      Import key
                    </button>
                  </div>

                  <div className="col" style={{ gap: 12 }}>
                    <span className="stat-label">From encrypted keystore JSON</span>
                    <textarea
                      className="input"
                      rows={5}
                      spellCheck={false}
                      placeholder='{"publicKey":"…","salt":"…","encrypted":"…","keyAddress":"…"}'
                      value={keystoreJson}
                      onChange={(e) => setKeystoreJson(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-block"
                      onClick={() => void onImportKeystore()}
                      disabled={busy}
                    >
                      <Upload size={14} />
                      Import keystore
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="alert alert-error">{error}</div>}
              {notice && <div className="alert alert-ok">{notice}</div>}
            </div>
          </Card>

          <Card title={`Stored wallets (${wallets.length})`}>
            {wallets.length === 0 ? (
              <p className="muted small">Nothing stored in this browser.</p>
            ) : (
              <div className="col" style={{ gap: 8 }}>
                {wallets.map((wallet) => (
                  <div key={wallet.address} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
                    <div className="col" style={{ gap: 3 }}>
                      <span className="mono small">{shortenAddress(wallet.address, 8)}</span>
                      <span className="small faint">
                        {wallet.nickname ? `${wallet.nickname} · ` : ""}
                        {curveLabel(wallet.curveType)}
                      </span>
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <CopyButton value={wallet.address} label="" />
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        title="Remove from this browser"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove this wallet from this browser? Without your keystore backup this is irreversible.",
                            )
                          ) {
                            forget(wallet.address);
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {sending && <TransactionModal onClose={() => setSending(false)} />}
    </>
  );
}
