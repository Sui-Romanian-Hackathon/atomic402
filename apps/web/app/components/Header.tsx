"use client";

import {
  ConnectButton,
  useCurrentAccount,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { Atom, Wallet } from "lucide-react";

export function Header() {
  const account = useCurrentAccount();

  const { data: balance } = useSuiClientQuery(
    "getBalance",
    {
      owner: account?.address || "",
    },
    {
      enabled: !!account?.address,
    }
  );

  const formattedBalance = balance
    ? (Number(balance.totalBalance) / 1_000_000_000).toFixed(2)
    : "0.00";

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-linear-to-br from-blue-500 to-purple-600 p-2 rounded-lg">
              <Atom className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">atomic402</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {account && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <Wallet className="w-4 h-4 text-blue-600" />
                <span className="font-mono text-sm font-medium">
                  {formattedBalance} SUI
                </span>
              </div>
            )}
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
