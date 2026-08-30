"use client";

import { useState, useEffect } from "react";

type LendingConfig = {
  whitelistedCurrencies: string[];
  bufferThreshold: number;
  fundingFeeRate: number;
};

export default function LendingAdmin() {
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app, verify admin signature/wallet here
    // e.g., check if connected wallet has admin role
    const checkAdmin = async () => {
      const address = localStorage.getItem("connectedWallet");
      if (!address) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/admin/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const { isAdmin, config } = await res.json();
        setIsAdmin(isAdmin);
        setConfig(config);
      } catch (e) {
        console.error("Admin check failed", e);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  if (loading) return <p>Loading admin panel...</p>;
  if (!isAdmin) return <p className="text-red-600">Access denied. Admin wallet required.</p>;

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="mb-4 text-xl font-semibold">Lending Admin Panel</h2>

      <div className="mb-4">
        <h3 className="font-medium">Global Lending Config</h3>
        <pre className="mt-2 rounded bg-gray-100 p-3 font-mono text-sm">
          <code>Whitelisted Currencies: {config?.whitelistedCurrencies.join(", ")}</code>
          <code>Buffer Threshold: {config?.bufferThreshold}</code>
          <code>Funding Fee Rate: {config?.fundingFeeRate}%</code>
        </pre>
      </div>

      <div className="mt-6">
        <h3 className="font-medium">Whitelist Currency</h3>
        <input
          type="text"
          placeholder="Currency code (e.g. XLM)"
          className="w-full p-2 rounded border"
        />
        <button className="mt-2 px-4 py-2 bg-primary text-white rounded">
          Add
        </button>
      </div>

      <div className="mt-6">
        <h3 className="font-medium">Buffer/Threshold Adjustment</h3>
        <input
          type="number"
          placeholder="New buffer threshold"
          className="w-full p-2 rounded border"
        />
        <button className="mt-2 px-4 py-2 bg-primary text-white rounded">
          Update
        </button>
      </div>
    </div>
  )
}