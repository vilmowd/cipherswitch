export const VAULT_TEMPLATES = [
  {
    id: "last-letter",
    name: "Last letter",
    description: "A personal message released if you go silent.",
    suggested_interval_days: 14,
    placeholder:
      "My dearest…\n\nIf you’re reading this, I wasn’t able to check in.\n\nPlease…",
  },
  {
    id: "recovery-codes",
    name: "Recovery codes",
    description: "Backup 2FA / account recovery codes for someone you trust.",
    suggested_interval_days: 7,
    placeholder: "Service:\nCodes:\n1.\n2.\n3.",
  },
  {
    id: "seed-phrase",
    name: "Seed phrase packet",
    description: "Wallet seed or key material — use a strong unique passphrase.",
    suggested_interval_days: 7,
    placeholder: "Wallet label:\nSeed words:\n",
  },
  {
    id: "executor-notes",
    name: "Executor notes",
    description: "Practical instructions for an executor or next of kin.",
    suggested_interval_days: 30,
    placeholder:
      "Document locations:\nAccounts to notify:\nKey contacts:\n",
  },
  {
    id: "unreachable-30d",
    name: "If unreachable 30 days",
    description: "Contingency plan when you can’t be reached for a month.",
    suggested_interval_days: 30,
    placeholder: "If I haven’t checked in for 30 days, please…",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Blank vault — write anything.",
    suggested_interval_days: 7,
    placeholder: "",
  },
];
