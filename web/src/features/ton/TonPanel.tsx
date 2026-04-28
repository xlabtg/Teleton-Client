import { TonConnectButton } from '@tonconnect/ui-react';
import { Send, WalletCards } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { useTeletonStore } from '../../shared/store/useTeletonStore';

export function TonPanel() {
  const tonBalance = useTeletonStore((state) => state.tonBalance);
  const getTonBalance = useTeletonStore((state) => state.getTonBalance);
  const sendTonTx = useTeletonStore((state) => state.sendTonTx);
  const [address, setAddress] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [txHash, setTxHash] = useState('');

  const requestBalance = (event: FormEvent) => {
    event.preventDefault();
    if (address.trim()) void getTonBalance(address.trim());
  };

  const submitTx = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmation || !to.trim() || !amount.trim()) return;

    void sendTonTx({ to: to.trim(), amount: amount.trim(), comment: comment.trim() || undefined }).then(setTxHash);
  };

  return (
    <section className="min-h-screen px-5 py-6 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-mist bg-white p-5 shadow-panel">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center bg-mint text-white">
                <WalletCards size={21} />
              </span>
              <div>
                <h1 className="text-xl font-semibold">TON</h1>
                <p className="text-sm text-ink/58">Agent-backed operations</p>
              </div>
            </div>
            <TonConnectButton />
          </div>

          <form className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={requestBalance}>
            <label className="block text-sm font-medium">
              Address
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="self-end bg-teal px-4 py-3 text-sm font-semibold text-white hover:bg-ink"
            >
              Balance
            </button>
          </form>

          <form className="grid gap-4" onSubmit={submitTx}>
            <label className="block text-sm font-medium">
              Recipient
              <input className="mt-2 h-11 w-full border border-mist px-3" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Amount
              <input className="mt-2 h-11 w-full border border-mist px-3" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Comment
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" checked={confirmation} onChange={(event) => setConfirmation(event.target.checked)} />
              <span>Confirm transaction</span>
            </label>
            <button
              type="submit"
              className="flex h-10 w-fit items-center gap-2 bg-mint px-4 text-sm font-semibold text-white hover:bg-ink disabled:cursor-not-allowed disabled:bg-ink/30"
              disabled={!confirmation}
            >
              <Send size={17} />
              Send
            </button>
          </form>
        </div>

        <div className="border border-mist bg-white p-5 shadow-panel">
          <h2 className="mb-4 text-base font-semibold">Wallet State</h2>
          <dl className="grid gap-3 text-sm">
            <div className="border-b border-mist pb-3">
              <dt className="text-ink/58">Balance</dt>
              <dd className="mt-1 text-lg font-semibold">
                {tonBalance ? `${tonBalance.balance} ${tonBalance.currency}` : 'none'}
              </dd>
            </div>
            <div className="border-b border-mist pb-3">
              <dt className="text-ink/58">Address</dt>
              <dd className="mt-1 break-all font-mono text-xs">{tonBalance?.address ?? 'none'}</dd>
            </div>
            <div>
              <dt className="text-ink/58">Transaction</dt>
              <dd className="mt-1 break-all font-mono text-xs">{txHash || 'none'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
