# @tetherto/wdk-wallet-multisig-safe

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A Safe multisig wallet module for WDK (Wallet Development Kit) by Tether, with ERC-4337 account abstraction for EVM-compatible blockchains. This package provides a clean API for creating, managing, and interacting with multisig wallets using BIP-39 seed phrases and the Safe smart contract infrastructure.

## 🔍 About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://wdk.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wdk.tether.io](https://docs.wdk.tether.io/).

## 🌟 Features

- **Safe Protocol Integration**: Full support for Safe (formerly Gnosis Safe) multisig wallets
- **ERC-4337 Account Abstraction**: Gasless transactions via paymasters and bundlers
- **Paymaster Modes**: Support for both ERC-20 paymaster and sponsored (gasless) modes
- **Per-Transaction Paymaster Override**: Switch between ERC-20 and sponsored mode on a per-transaction basis
- **Multi-Owner Management**: Add, remove, swap owners and change threshold
- **Propose/Approve/Execute Flow**: Standard multisig transaction workflow
- **Message Signing**: Propose/approve flow for multisig message signing with EIP-1271 verification
- **Deterministic Addresses**: Predictable Safe addresses from owner configuration
- **Auto-Execute**: Optionally auto-execute transactions when threshold is met (`autoExecute: true`)

## ⬇️ Installation

```bash
npm install @tetherto/wdk-wallet-multisig-safe
```

## 🚀 Quick Start

### Creating a New 2-of-2 Multisig Safe

```javascript
import WalletManagerMultisigSafe, {
  WalletAccountMultisigSafe,
  WalletAccountReadOnlyMultisigSafe
} from '@tetherto/wdk-wallet-multisig-safe'

// Owner seed phrases
const aliceSeed = 'alice seed phrase here...'
const bobSeed = 'bob seed phrase here...'

// Get owner addresses first
const aliceEoa = '0x...'
const bobEoa = '0x...'

// Create Alice's multisig account using PredictedSafeOptions
const alice = new WalletAccountMultisigSafe(aliceSeed, "0'/0/0", {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  paymasterUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  paymasterAddress: '0x...',
  paymasterTokenAddress: '0x...', // USDT address
  safeApiKey: 'YOUR_SAFE_API_KEY', // OR txServiceUrl: 'https://your-proxy.com/safe'
  safeOptions: {
    owners: [aliceEoa, bobEoa],
    threshold: 2,
    saltNonce: '0x...' // Optional
  }
})

// Get predicted Safe address (before deployment)
const safeAddress = await alice.getAddress()
console.log('Safe Address:', safeAddress)

// Check if deployed
const isDeployed = await alice.isDeployed()
console.log('Is Deployed:', isDeployed)
```

### Wrapping an Existing WalletAccountEvm

`WalletAccountMultisigSafe` has two constructor overloads:

- `new WalletAccountMultisigSafe(seed, path, config)` — standard BIP-44 derivation
- `new WalletAccountMultisigSafe(walletAccountEvm, config)` — wrap an existing `WalletAccountEvm`

With the second form the Safe owner can be backed by any signer the wallet-evm account supports, such as an external custody provider implementing `ISignerEvm`. The argument must be a `WalletAccountEvm` wrapping the signer, not the signer itself. The account may come from any installed version of `@tetherto/wdk-wallet-evm`.

Two things to keep in mind with a wrapped account:

- `deploy()` sends the deployment transaction through the wrapped account, so it must be connected to a provider on the same chain as `chainId`. Proposals and executions go through the bundler and do not need it.
- `index` and `path` are `undefined` when the signer is not derived from a seed (e.g. a private-key or custody signer), and `keyPair` throws when the signer does not expose its key material.

```javascript
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { WalletAccountMultisigSafe } from '@tetherto/wdk-wallet-multisig-safe'

// Any ISignerEvm implementation (hardware wallet, MPC provider, backend signer, ...)
const externalSigner = new MyCustodySigner({ /* ... */ })

const ownerAccount = new WalletAccountEvm(externalSigner, {
  provider: 'https://your-rpc-provider.example'
})

const alice = new WalletAccountMultisigSafe(ownerAccount, {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  safeApiKey: 'YOUR_SAFE_API_KEY',
  safeOptions: {
    owners: [await ownerAccount.getAddress(), bobEoa],
    threshold: 2
  }
})

// The caller owns the lifecycle of ownerAccount: alice.dispose() leaves it untouched
alice.dispose()
ownerAccount.dispose()
```

### Importing an Existing Safe

```javascript
// Import using ExistingSafeOptions
const alice = new WalletAccountMultisigSafe(aliceSeed, "0'/0/0", {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  paymasterUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  paymasterAddress: '0x...',
  paymasterTokenAddress: '0x...',
  safeApiKey: 'YOUR_SAFE_API_KEY', // OR txServiceUrl: 'https://your-proxy.com/safe'
  safeOptions: {
    safeAddress: '0x...' // Existing Safe address
  }
})

// Get Safe info
const owners = await alice.getOwners()
const threshold = await alice.getThreshold()
console.log('Owners:', owners)
console.log('Threshold:', threshold)
```

### Full Multisig Transaction Flow

```javascript
// Alice proposes a transaction
const tx = {
  to: '0x000000000000000000000000000000000000dEaD',
  value: '0',
  data: '0x'
}

// Get fee estimate
const quote = await alice.quoteSendTransaction(tx)
console.log('Estimated fee:', quote.fee)

// Propose transaction
const proposal = await alice.propose(tx, {
  amountToApprove: quote.fee * 150n / 100n // 50% buffer
})
console.log('SafeOp Hash:', proposal.proposalId)
console.log('Confirmations:', proposal.confirmations, '/', proposal.threshold)

// Bob approves
const bob = new WalletAccountMultisigSafe(bobSeed, "0'/0/0", config)
const approval = await bob.approveProposal(proposal.proposalId)
console.log('Confirmations:', approval.confirmations, '/', approval.threshold)

// Execute when threshold met
const result = await alice.executeProposal(proposal.proposalId)
console.log('UserOp Hash:', result.hash)
```

### Using `propose` (Auto-Execute)

`propose` and `proposeTransfer` accept an optional `autoExecute` flag. When `autoExecute: true` and the threshold is met after proposing, the transaction is executed automatically and its on-chain result is returned under `transaction`:

```javascript
// With autoExecute: true, executes immediately if threshold is met
const result = await alice.propose({
  to: '0x...',
  value: '1000000000000000000', // 1 ETH
  data: '0x'
}, { autoExecute: true })

console.log('Proposal:', result.proposalId)
console.log('Confirmations:', result.confirmations, '/', result.threshold)
console.log('Status:', result.status) // 'pending' | 'executed'

if (result.status === 'executed') {
  console.log('Tx Hash:', result.transaction.hash)
  console.log('Fee:', result.transaction.fee)
} else {
  // Need more signatures
  await bob.approveProposal(result.proposalId)
  const execResult = await alice.executeProposal(result.proposalId)
  console.log('Tx Hash:', execResult.hash)
}
```

### Deploying a Safe

**Important**: Safe deployment requires native ETH in the deployer's EOA account to pay for the deployment transaction gas. After deployment, all subsequent transactions can use paymaster (ERC-20 tokens) or sponsored mode for gas payment.

```javascript
// Ensure the signer's EOA has ETH for deployment gas
const alice = new WalletAccountMultisigSafe(aliceSeed, "0'/0/0", {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  paymasterUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  paymasterTokenAddress: '0x...', // USDT address
  safeApiKey: 'YOUR_SAFE_API_KEY', // OR txServiceUrl: 'https://your-proxy.com/safe'
  safeOptions: {
    owners: [aliceEoa, bobEoa],
    threshold: 2
  }
})

// Check signer's EOA address and fund it with ETH
const signerEoa = await alice.getSignerAddress()
console.log('Fund this address with ETH for deployment:', signerEoa)

// Get deployment fee estimate
const { fee } = await alice.quoteDeploy()
console.log('Estimated deployment fee:', fee)

// Deploy the Safe (requires ETH in signer's EOA)
const deployResult = await alice.deploy()
console.log('Tx Hash:', deployResult.hash)
console.log('Fee:', deployResult.fee)

// After deployment, transactions can use paymaster or sponsored mode
// No more ETH needed in the Safe or signer's EOA!
const result = await alice.propose({
  to: '0x...',
  value: '0',
  data: '0x...'
})
```

### ERC-20 Paymaster Mode

The Safe pays gas fees using ERC-20 tokens (e.g., USDT). The Safe must hold sufficient tokens.

Every fee this package reports is a maximum. In this mode it is the most the paymaster can charge for the operation, in token units, decoded from the signed operation itself so that every owner sees the same figure. Display it as "up to": the actual charge is usually well below it.

```javascript
const alice = new WalletAccountMultisigSafe(aliceSeed, "0'/0/0", {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  paymasterUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  paymasterAddress: '0x...',
  paymasterTokenAddress: '0x...',
  safeOptions: {
    safeAddress: '0x...'
  }
})

// Propose with token approval for gas
const quote = await alice.quoteSendTransaction(tx)
const proposal = await alice.propose(tx, {
  amountToApprove: quote.fee * 150n / 100n
})
```

### Sponsored Mode (Gasless)

A sponsor pays the gas fees, making transactions completely free for the Safe. No tokens required in the Safe.

```javascript
const alice = new WalletAccountMultisigSafe(aliceSeed, "0'/0/0", {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  paymasterUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  isSponsored: true,
  sponsorshipPolicyId: 'sp_my_policy',
  safeApiKey: 'YOUR_SAFE_API_KEY', // OR txServiceUrl: 'https://your-proxy.com/safe'
  safeOptions: {
    safeAddress: '0x...'
  }
})

// No amountToApprove needed - sponsor pays gas!
const proposal = await alice.propose(tx)
console.log('SafeOp Hash:', proposal.proposalId)

// Bob approves
const approval = await bob.approveProposal(proposal.proposalId)

// Execute - completely gasless for the Safe
const result = await alice.executeProposal(proposal.proposalId)
console.log('UserOp Hash:', result.hash)
```

### Per-Transaction Paymaster Override

You can override the paymaster mode on a per-transaction basis, regardless of the account's default configuration
```javascript
// Account configured with ERC-20 paymaster (USDT)
const alice = new WalletAccountMultisigSafe(aliceSeed, "0'/0/0", {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  paymasterUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  paymasterTokenAddress: '0xUSDT...', // Default: pay gas with USDT
  safeApiKey: 'YOUR_SAFE_API_KEY', // OR txServiceUrl: 'https://your-proxy.com/safe'
  safeOptions: {
    safeAddress: '0x...'
  }
})

// Override to sponsored mode for this specific transaction
const result = await alice.propose(tx, {
  isSponsored: true  // This transaction will be gasless!
})

// Or override to use a different token
const result2 = await alice.propose(tx, {
  paymasterTokenAddress: '0xUSDT...'  // Pay gas with USDT instead
})
```

```javascript
// Account configured with sponsored mode
const bob = new WalletAccountMultisigSafe(bobSeed, "0'/0/0", {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  paymasterUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  isSponsored: true, // Default: gasless
  safeApiKey: 'YOUR_SAFE_API_KEY', // OR txServiceUrl: 'https://your-proxy.com/safe'
  safeOptions: {
    safeAddress: '0x...'
  }
})

// Override to ERC-20 paymaster for this specific transaction
const quote = await bob.quoteSendTransaction(tx, {
  isSponsored: false,
  paymasterTokenAddress: '0xUSDT...'
})

const result = await bob.propose(tx, {
  isSponsored: false,
  paymasterTokenAddress: '0xUSDT...',
  amountToApprove: quote.fee * 150n / 100n
})
```

**Override Options:**

| Option | Description |
|--------|-------------|
| `isSponsored` | Override to sponsored mode (`true`) or ERC-20 mode (`false`) |
| `sponsorshipPolicyId` | Override sponsorship policy ID (for sponsored mode) |
| `paymasterTokenAddress` | Override token address for gas payment (for ERC-20 mode) |
| `amountToApprove` | Token amount to approve for paymaster (for ERC-20 mode) |

### Owner Management

```javascript
// Add new owner (optionally set new threshold)
const proposal = await alice.addOwner('0xNewOwner...', {
  threshold: 2, // optional, defaults to current threshold
  amountToApprove: fee * 200n / 100n
})

// Remove owner (optionally set new threshold)
const proposal = await alice.removeOwner('0xOwnerToRemove...', {
  threshold: 1 // optional, defaults to current (auto-adjusted if needed)
})

// Swap owner
const proposal = await alice.swapOwner('0xOldOwner...', '0xNewOwner...')

// Change threshold
const proposal = await alice.changeThreshold(2)

// Batch update owners and threshold
const proposal = await alice.updateOwners(
  ['0xOwner1...', '0xOwner2...', '0xOwner3...'],
  2
)
```

### Message Signing
```javascript
// Alice proposes signing a message
const result = await alice.proposeMessage('Hello from Safe!')
console.log('Alice Signature:', result.signature)
console.log('Message Id:', result.messageId)
console.log('Confirmations:', result.confirmations, '/', result.threshold)

// Bob approves the message
const approval = await bob.approveMessageProposal(result.messageId)
console.log('Bob Signature:', approval.signature)
console.log('Confirmations:', approval.confirmations, '/', approval.threshold)

// Get combined signature when fully signed
if (approval.combinedSignature) {
  console.log('Combined Signature:', approval.combinedSignature)

  // Verify the combined signature on-chain (EIP-1271)
  const isValid = await alice.verify('Hello from Safe!', approval.combinedSignature)
  console.log('Signature valid:', isValid)
}

// Get message status anytime (returns a map keyed by message id)
const messages = await alice.getMessageProposals([result.messageId])
const message = messages[result.messageId]
console.log('Message:', message.message)
console.log('Confirmations:', message.confirmations, '/', message.threshold)
console.log('Combined Signature:', message.combinedSignature)
```

### Read-Only Account

```javascript
import { WalletAccountReadOnlyMultisigSafe } from '@tetherto/wdk-wallet-multisig-safe'

const readOnly = new WalletAccountReadOnlyMultisigSafe({
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  safeApiKey: 'YOUR_SAFE_API_KEY', // OR txServiceUrl: 'https://your-proxy.com/safe'
  safeOptions: {
    safeAddress: '0x...'
  }
})

// Query Safe info
const owners = await readOnly.getOwners()
const threshold = await readOnly.getThreshold()
const balance = await readOnly.getBalance()

// Get proposals status (returns a map keyed by proposal id)
const proposals = await readOnly.getProposals([proposalHash1, proposalHash2])

// Get messages status (returns a map keyed by message id)
const messages = await readOnly.getMessageProposals([messageHash1, messageHash2])

// Get fee estimates
const quote = await readOnly.quoteSendTransaction(tx)
```

**UserOp Explorers:**

You can track UserOp status on these explorers:

- **JiffyScan**: `https://jiffyscan.xyz/userOpHash/{userOpHash}?network=sepolia`
- **Blockscout**: `https://eth-sepolia.blockscout.com/op/{userOpHash}`

## 🔁 Calldata Coordinator

Multisig signing requires sharing transaction and message calldata (proposals and their confirmations) between the Safe's owners. This package isolates that responsibility behind the `IMultisigCoordinator` interface, so you can choose how calldata is shared.

By default no extra configuration is needed: when you pass `safeApiKey` or `txServiceUrl`, the account automatically uses the built-in `SafeTxServiceCoordinator`, which talks to the [Safe Transaction Service](https://docs.safe.global/core-api/transaction-service-overview) via `@safe-global/api-kit`. External behaviour is unchanged.

To route calldata through your own backend instead (a relay, a database, a peer-to-peer channel, etc.), pass a custom `coordinator` in the config. When `coordinator` is provided it takes precedence and `safeApiKey`/`txServiceUrl` are ignored.

### The `coordinator` config option

| Option | Description |
|--------|-------------|
| `coordinator` | An `IMultisigCoordinator` instance used to share multisig calldata between signers. Optional. Defaults to a `SafeTxServiceCoordinator` built from `txServiceUrl`/`safeApiKey`. |

### Writing a custom coordinator

A coordinator implements six methods — three for transaction proposals and three for message proposals. Extend `IMultisigCoordinator` (so unimplemented methods throw a clear error), return `null` from the getters when nothing is found, and shape the results like the ones the Safe Transaction Service returns (a `confirmations` array, and `preparedSignature` for messages). Serialize outgoing payloads with the exported `toJsonSafe` helper so native values (BigInt, byte arrays) survive `JSON.stringify`.

```javascript
import WalletManagerMultisigSafe, {
  IMultisigCoordinator,
  toJsonSafe
} from '@tetherto/wdk-wallet-multisig-safe'

class MyBackendCoordinator extends IMultisigCoordinator {
  constructor (baseUrl) {
    super()
    this._baseUrl = baseUrl
  }

  // --- Transaction proposals ---

  async submitProposal (proposal) {
    await fetch(`${this._baseUrl}/proposals`, {
      method: 'POST',
      body: JSON.stringify(toJsonSafe(proposal))
    })
  }

  async getProposal (proposalId) {
    const res = await fetch(`${this._baseUrl}/proposals/${proposalId}`)
    return res.ok ? res.json() : null // { confirmations: [...], userOperation: {...}, ... }
  }

  async confirmProposal (proposalId, signature) {
    await fetch(`${this._baseUrl}/proposals/${proposalId}/confirmations`, {
      method: 'POST',
      body: JSON.stringify({ signature })
    })
  }

  // --- Message proposals ---

  async submitMessage (safeAddress, message) {
    await fetch(`${this._baseUrl}/messages`, {
      method: 'POST',
      body: JSON.stringify({ safeAddress, ...message })
    })
  }

  async getMessage (messageId) {
    const res = await fetch(`${this._baseUrl}/messages/${messageId}`)
    return res.ok ? res.json() : null // { message, confirmations: [...], preparedSignature }
  }

  async confirmMessage (messageId, signature) {
    await fetch(`${this._baseUrl}/messages/${messageId}/confirmations`, {
      method: 'POST',
      body: JSON.stringify({ signature })
    })
  }
}

const wallet = new WalletManagerMultisigSafe(seed, {
  provider: 'https://your-rpc-provider.example',
  bundlerUrl: 'https://your-aa-provider.example/rpc?apikey=YOUR_KEY',
  chainId: 11155111n,
  coordinator: new MyBackendCoordinator('https://your-backend.com/safe'),
  safeOptions: {
    safeAddress: '0x...'
  }
})
```

You can also instantiate the default coordinator explicitly, for example to share a single instance:

```javascript
import { SafeTxServiceCoordinator } from '@tetherto/wdk-wallet-multisig-safe'

const coordinator = new SafeTxServiceCoordinator({
  chainId: 11155111n,
  apiKey: 'YOUR_SAFE_API_KEY' // or txServiceUrl: 'https://your-proxy.com/safe'
})
```

## 🔐 Security Notes

### Safe API Key

Safe requires authenticated API access. Get your API key from the [Safe Developer Dashboard](https://developer.safe.global).

- **Backend / Testing**: Pass `safeApiKey` directly in config. Safe for server-side use.
- **Frontend**: Recommended to not expose `safeApiKey` in client code. Use `txServiceUrl` pointing to a backend proxy that injects the key server-side.

```javascript
// DON'T - exposes your API key in frontend bundle
const config = {
  safeApiKey: 'eyJhb...',  // Anyone can extract this
  // ...
}

// DO - proxy injects the key server-side
const config = {
  txServiceUrl: 'https://your-backend.com/safe-proxy',
  // ...
}
```

### Sponsorship Policy

When using sponsored (gasless) mode, the `sponsorshipPolicyId` is visible to the client. Without restrictions, anyone could use your policy to sponsor their own transactions.

**Recommended**: Configure a sponsorship policy to control which transactions get sponsored:

- **Webhook verification**: Validate each sponsorship request server-side before approving
- **Policy rules**: Restrict by sender address, contract, gas limit, time window, etc.

Consult your paymaster provider's documentation for configuring sponsorship policies and webhook verification. This package is provider-agnostic and works with any ERC-4337 bundler and ERC-7677 paymaster.

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint
```

## 📜 License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please submit a Pull Request.

## 🆘 Support

For support, open an issue on the GitHub repository.
