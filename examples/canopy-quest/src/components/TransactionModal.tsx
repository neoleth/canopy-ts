import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Send, X } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useQuests } from "../hooks/useQuests";
import { describeError, getSendFee, networkConfig, sendTransaction } from "../lib/canopy";
import type { SendFee } from "../lib/canopy";
import { formatWithSymbol, normalizeAddress, validateSend } from "../lib/format";
import { CopyButton } from "./CopyButton";

type Step = "form" | "confirm" | "sending" | "done";

/**
 * Send flow: validate → summarise → explicit confirm → build+sign locally with
 * the SDK → broadcast → report the node's real response. No hash is ever shown
 * that did not come back from the node.
 */
export function TransactionModal({ onClose }: { onClose: () => void }) {
  const { session, balance, refreshBalance } = useWallet();
  const { recordTransaction } = useQuests();

  const [step, setStep] = useState<Step>("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [fee, setFee] = useState<SendFee | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ recipient?: string; amount?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSendFee()
      .then((value) => !cancelled && setFee(value))
      .catch((error) => !cancelled && setFeeError(describeError(error, "Could not read the network fee.")));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) return null;

  const feeMicro = fee?.micro ?? networkConfig.fallbackSendFee;

  const review = () => {
    const result = validateSend({
      recipient,
      amount,
      balanceMicro: balance?.micro ?? 0,
      feeMicro,
      selfAddress: session.address,
    });
    setErrors(result.errors);
    if (result.ok) setStep("confirm");
  };

  const validated = validateSend({
    recipient,
    amount,
    balanceMicro: balance?.micro ?? 0,
    feeMicro,
    selfAddress: session.address,
  });

  const submit = async () => {
    setStep("sending");
    setSubmitError(null);
    try {
      const hash = await sendTransaction({
        fromAddress: session.address,
        toAddress: normalizeAddress(recipient),
        amountMicro: validated.amountMicro,
        feeMicro,
        memo: memo.trim() || undefined,
        privateKeyHex: session.privateKeyHex,
        publicKeyHex: session.publicKeyHex,
        curveType: session.curveType,
      });
      setTxHash(hash);
      recordTransaction(hash);
      setStep("done");
      void refreshBalance();
    } catch (error) {
      setSubmitError(describeError(error, "Transaction broadcast failed."));
      setStep("confirm");
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span className="card-title-icon">
            {step === "done" ? <CheckCircle2 size={18} /> : <Send size={18} />}
          </span>
          <h3>{step === "done" ? "Transaction submitted" : "Send tokens"}</h3>
          <span className="spacer" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </header>

        {step === "form" && (
          <div className="col" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="tx-recipient">Recipient address</label>
              <input
                id="tx-recipient"
                className="input mono"
                placeholder="40 hex characters"
                value={recipient}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setRecipient(e.target.value)}
              />
              {errors.recipient && <span className="field-error">{errors.recipient}</span>}
            </div>

            <div className="field">
              <label htmlFor="tx-amount">Amount ({networkConfig.denomSymbol})</label>
              <input
                id="tx-amount"
                className="input"
                inputMode="decimal"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {errors.amount && <span className="field-error">{errors.amount}</span>}
              <span className="hint">
                Available: {balance ? formatWithSymbol(balance.micro) : "unknown"} · network fee{" "}
                {formatWithSymbol(feeMicro)}
                {fee?.source === "fallback" && " (node did not report a fee; using configured fallback)"}
              </span>
            </div>

            <div className="field">
              <label htmlFor="tx-memo">Memo (optional)</label>
              <input
                id="tx-memo"
                className="input"
                placeholder="Included in the signed transaction"
                value={memo}
                maxLength={200}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            {feeError && <div className="alert alert-warn">{feeError}</div>}

            <button type="button" className="btn btn-primary btn-block" onClick={review}>
              Review transaction
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {(step === "confirm" || step === "sending") && (
          <div className="col" style={{ gap: 14 }}>
            <div>
              <div className="summary-row">
                <span className="k">From</span>
                <span className="v mono">{session.address}</span>
              </div>
              <div className="summary-row">
                <span className="k">To</span>
                <span className="v mono">{normalizeAddress(recipient)}</span>
              </div>
              <div className="summary-row">
                <span className="k">Amount</span>
                <span className="v">{formatWithSymbol(validated.amountMicro)}</span>
              </div>
              <div className="summary-row">
                <span className="k">Network fee</span>
                <span className="v">{formatWithSymbol(feeMicro)}</span>
              </div>
              <div className="summary-row">
                <span className="k">Total</span>
                <span className="v">
                  <strong>{formatWithSymbol(validated.totalMicro)}</strong>
                </span>
              </div>
              {memo.trim() && (
                <div className="summary-row">
                  <span className="k">Memo</span>
                  <span className="v">{memo.trim()}</span>
                </div>
              )}
              <div className="summary-row">
                <span className="k">Chain</span>
                <span className="v">
                  {networkConfig.networkName} · network {networkConfig.networkID} / chain{" "}
                  {networkConfig.chainID}
                </span>
              </div>
            </div>

            {submitError && <div className="alert alert-error">{submitError}</div>}

            <p className="hint">
              This transaction is signed in your browser with your unlocked key. Your key never
              leaves this device — only the signed transaction is broadcast.
            </p>

            <div className="row" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setStep("form")}
                disabled={step === "sending"}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => void submit()}
                disabled={step === "sending"}
              >
                {step === "sending" ? "Signing and broadcasting…" : "Confirm and send"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && txHash && (
          <div className="col" style={{ gap: 14 }}>
            <div className="alert alert-ok">
              The node accepted the transaction. It becomes final once included in a block.
            </div>
            <div className="col" style={{ gap: 6 }}>
              <span className="stat-label">Transaction hash</span>
              <span className="mono small" style={{ wordBreak: "break-all" }}>
                {txHash}
              </span>
              <CopyButton value={txHash} label="Copy hash" />
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
