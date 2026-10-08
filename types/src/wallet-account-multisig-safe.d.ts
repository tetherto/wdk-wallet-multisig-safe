/** @typedef {import('@tetherto/wdk-wallet/multisig').IWalletAccountMultisig} IWalletAccountMultisig */
/** @typedef {import('@tetherto/wdk-wallet/multisig').IMultisigOwnerManagement} IMultisigOwnerManagement */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigTransactionOptions} MultisigTransactionOptions */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInteractionResult} MultisigInteractionResult */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigSignature} MultisigSignature */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigOptions} MultisigOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferOptions} TransferOptions */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletConfig} MultisigSafeWalletConfig */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletPaymasterTokenConfig} MultisigSafeWalletPaymasterTokenConfig */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletSponsoredConfig} MultisigSafeWalletSponsoredConfig */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletNativeCoinsConfig} MultisigSafeWalletNativeCoinsConfig */
/**
 * Multisig Safe wallet account with signing capabilities.
 * Provides full transaction and message signing operations.
 */
export default class WalletAccountMultisigSafe extends WalletAccountReadOnlyMultisigSafe implements IWalletAccountMultisig, IMultisigOwnerManagement {
    /**
     * Creates a new multisig Safe wallet account.
     *
     * @overload
     * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {string} path - The BIP-44 derivation path (e.g., "0'/0/0")
     * @param {MultisigSafeWalletConfig} config - The configuration object
     * @throws {Error} If the seed is not a valid BIP-39 mnemonic.
     * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
     */
    constructor(seed: string | Uint8Array, path: string, config: MultisigSafeWalletConfig);
    /**
     * Creates a new multisig Safe wallet account from a wallet-evm account. The account acts as the Safe owner, so
     * the owner can be backed by any signer the wallet-evm account supports. To call `deploy`, the account must be
     * connected to a provider on the same chain as the one in the configuration.
     *
     * @overload
     * @param {MultisigSafeOwnerAccount} account - The owner account that signs this instance's proposals, approvals and
     *   messages, and sends the deployment transaction.
     * @param {MultisigSafeWalletConfig} config - The configuration object
     * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
     */
    constructor(account: MultisigSafeOwnerAccount, config: MultisigSafeWalletConfig);
    /**
     * The signer account.
     *
     * @private
     * @type {MultisigSafeOwnerAccount}
     */
    private _signerAccount;
    /** @private */
    private _isExternalSignerAccount;
    /**
     * The derivation path's index of this account, or `undefined` when the owner account does not expose one.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)),
     * or `undefined` when the owner account does not expose one.
     *
     * @type {string}
     */
    get path(): string;
    /**
     * The key pair of this account.
     *
     * @type {KeyPair}
     * @throws {Error} If the owner account does not expose its key material.
     */
    get keyPair(): KeyPair;
    /**
     * Returns the signer's address.
     *
     * @returns {Promise<string>} The signer's address.
     */
    getSignerAddress(): Promise<string>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign
     * @returns {Promise<string>} The signature
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a message with the multisig Safe.
     * Proposes a new message for the other owners to confirm.
     *
     * @param {string} message - The message to sign
     * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The sign result
     * @throws {Error} If the signer is not an owner of the Safe.
     */
    proposeMessage(message: string): Promise<MultisigMessageProposal & MultisigSignature>;
    /**
     * Approves an existing message proposal.
     *
     * @param {string} messageId - The message hash to approve
     * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The approval result
     * @throws {Error} If the signer is not an owner of the Safe.
     * @throws {Error} If no message exists for the given hash.
     * @throws {Error} If the message returned by the coordinator does not hash to the requested id.
     */
    approveMessageProposal(messageId: string): Promise<MultisigMessageProposal & MultisigSignature>;
    /**
     * Validates that the signer is an owner of the Safe.
     *
     * @returns {Promise<void>}
     * @throws {Error} If signer is not an owner
     */
    validateSignerIsOwner(): Promise<void>;
    /**
     * Deploys the Safe.
     * Requires native ETH in the signer's EOA account to pay for gas.
     *
     * @returns {Promise<TransactionResult>} Deployment result with transaction hash and fee
     * @throws {Error} If Safe is already deployed
     * @throws {Error} If the owner account is not connected to a provider.
     */
    deploy(): Promise<TransactionResult>;
    /**
     * Proposes a transaction for multisig approval.
     * Auto-executes if `autoExecute` is true and threshold is met after proposing.
     *
     * @param {EvmTransaction} tx - The transaction to propose
     * @param {MultisigTransactionOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Send and paymaster config options
     * @returns {Promise<MultisigProposal & MultisigInteractionResult>} The created proposal; its `status` is `'executed'` when `autoExecute` ran to completion, otherwise `'pending'`. When it auto-executed, `transaction` holds the on-chain result.
     */
    propose(tx: EvmTransaction, options?: MultisigTransactionOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal & MultisigInteractionResult>;
    /**
     * Proposes transferring a token to another address for multisig approval.
     * Auto-executes if `autoExecute` is true and threshold is met after proposing.
     *
     * @param {TransferOptions} transferOptions - Transfer options
     * @param {MultisigTransactionOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Send and paymaster config options
     * @returns {Promise<MultisigProposal & MultisigInteractionResult>} The created proposal; its `status` is `'executed'` when `autoExecute` ran to completion, otherwise `'pending'`. When it auto-executed, `transaction` holds the on-chain result.
     * @throws {Error} If the estimated fee exceeds the configured `transferMaxFee`.
     */
    proposeTransfer(transferOptions: TransferOptions, options?: MultisigTransactionOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal & MultisigInteractionResult>;
    /** @private */
    private _submitTransaction;
    /** @private */
    private _executeProposal;
    /**
     * Proposes a new transaction for multisig approval.
     * Builds a UserOperation, signs it as the proposer, and shares it through the coordinator.
     *
     * Note: `rejectProposal()` passes `customNonce` via config to reuse the original proposal's nonce.
     *
     * @protected
     * @param {EvmTransaction | EvmTransaction[]} transaction - The transaction(s) to propose
     * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
     * @returns {Promise<MultisigProposal>} The proposal result
     * @throws {Error} If the signer is not an owner of the Safe.
     */
    protected _propose(transaction: EvmTransaction | EvmTransaction[], config?: Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal>;
    /**
     * Approves (signs) an existing proposal.
     *
     * @param {string} proposalId - The Safe operation hash to approve
     * @returns {Promise<MultisigProposal & MultisigInteractionResult>} Approval result
     * @throws {Error} If the signer is not an owner of the Safe.
     * @throws {Error} If no proposal exists for the given id.
     * @throws {Error} If the proposal returned by the coordinator does not hash to the requested id.
     */
    approveProposal(proposalId: string): Promise<MultisigProposal & MultisigInteractionResult>;
    /**
     * Rejects a proposal by creating a rejection transaction.
     * A rejection is a zero-value transaction to the Safe itself with the same nonce.
     *
     * @param {string} proposalId - The Safe operation hash to reject
     * @returns {Promise<MultisigProposal>} The rejection proposal result
     * @throws {Error} If no proposal exists for the given id.
     * @throws {Error} If the original proposal has no nonce to reuse.
     */
    rejectProposal(proposalId: string): Promise<MultisigProposal>;
    /**
     * Executes a fully signed Safe operation via the bundler. The returned fee is expressed in the asset the Safe
     * pays gas with: zero when sponsored, paymaster token units when paying with a token, wei otherwise.
     *
     * @param {string} proposalId - The Safe operation hash to execute
     * @returns {Promise<TransactionResult>} The execution result
     * @throws {NoSuchElementError} If no proposal exists for the given id.
     * @throws {ValueError} If the proposal does not have enough confirmations to meet the threshold.
     * @throws {HashMismatchError} If the proposal returned by the coordinator does not hash to the requested id.
     * @throws {AbstractionKitError} If the operation uses a paymaster whose data cannot be decoded and the account is
     *   not sponsored.
     */
    executeProposal(proposalId: string): Promise<TransactionResult>;
    /**
     * Proposes adding a new owner to the Safe.
     *
     * @param {string} ownerAddress - Address of new owner
     * @param {MultisigOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Options with optional threshold and paymaster config
     * @returns {Promise<MultisigProposal>} The proposal result
     */
    addOwner(ownerAddress: string, options?: MultisigOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal>;
    /**
     * Proposes removing an owner from the Safe.
     *
     * @param {string} ownerAddress - Address of owner to remove
     * @param {MultisigOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Options with optional threshold and paymaster config
     * @returns {Promise<MultisigProposal>} The proposal result
     */
    removeOwner(ownerAddress: string, options?: MultisigOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal>;
    /**
     * Proposes swapping an owner with a new address.
     *
     * @param {string} oldOwnerAddress - Address of owner to remove
     * @param {string} newOwnerAddress - Address of new owner
     * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
     * @returns {Promise<MultisigProposal>} The proposal result
     */
    swapOwner(oldOwnerAddress: string, newOwnerAddress: string, config?: Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal>;
    /**
     * Proposes changing the Safe threshold.
     *
     * @param {number} newThreshold - New threshold value
     * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
     * @returns {Promise<MultisigProposal>} The proposal result
     */
    changeThreshold(newThreshold: number, config?: Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal>;
    /**
     * Proposes updating all owners and threshold in a batch.
     *
     * @param {string[]} newOwners - Array of new owner addresses
     * @param {number} newThreshold - New threshold value
     * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
     * @returns {Promise<MultisigProposal>} The proposal result
     * @throws {Error} If there are no owner or threshold changes to make.
     */
    updateOwners(newOwners: string[], newThreshold: number, config?: Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>): Promise<MultisigProposal>;
    /**
     * Returns a read-only copy of this account.
     *
     * @returns {Promise<WalletAccountReadOnlyMultisigSafe>} The read-only account
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyMultisigSafe>;
    /**
     * Disposes the wallet account, clearing sensitive data from memory. A caller-supplied owner account is left
     * untouched, since its lifecycle belongs to the caller.
     */
    dispose(): void;
    /** @private */
    private _buildSigner;
    /** @private */
    private _signTypedData;
    /** @private */
    private _verifyProposalId;
    /** @private */
    private _getProposalId;
    /** @private */
    private _getProposalTypedData;
    /** @private */
    private _getMessageId;
    /** @private */
    private _buildProposalPayload;
    /** @private */
    private _aggregateSignatures;
    /** @private */
    private _sendUserOperation;
}
export type IWalletAccountMultisig = import("@tetherto/wdk-wallet/multisig").IWalletAccountMultisig;
export type IMultisigOwnerManagement = import("@tetherto/wdk-wallet/multisig").IMultisigOwnerManagement;
export type MultisigProposal = import("@tetherto/wdk-wallet/multisig").MultisigProposal;
export type MultisigTransactionOptions = import("@tetherto/wdk-wallet/multisig").MultisigTransactionOptions;
export type MultisigInteractionResult = import("@tetherto/wdk-wallet/multisig").MultisigInteractionResult;
export type MultisigMessageProposal = import("@tetherto/wdk-wallet/multisig").MultisigMessageProposal;
export type MultisigSignature = import("@tetherto/wdk-wallet/multisig").MultisigSignature;
export type MultisigOptions = import("@tetherto/wdk-wallet/multisig").MultisigOptions;
export type KeyPair = import("@tetherto/wdk-wallet-evm").KeyPair;
export type EvmTransaction = import("@tetherto/wdk-wallet-evm").EvmTransaction;
export type TransactionResult = import("@tetherto/wdk-wallet-evm").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet-evm").TransferOptions;
export type MultisigSafeWalletConfig = import("./wallet-account-read-only-multisig-safe.js").MultisigSafeWalletConfig;
export type MultisigSafeWalletPaymasterTokenConfig = import("./wallet-account-read-only-multisig-safe.js").MultisigSafeWalletPaymasterTokenConfig;
export type MultisigSafeWalletSponsoredConfig = import("./wallet-account-read-only-multisig-safe.js").MultisigSafeWalletSponsoredConfig;
export type MultisigSafeWalletNativeCoinsConfig = import("./wallet-account-read-only-multisig-safe.js").MultisigSafeWalletNativeCoinsConfig;
/**
 * An account that can act as one of the Safe's owners, including one from another installed copy of
 * @tetherto/wdk-wallet-evm.
 */
export type MultisigSafeOwnerAccount = Pick<WalletAccountEvm, 'getAddress' | 'signTypedData' | 'sendTransaction'>;
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import WalletAccountReadOnlyMultisigSafe from './wallet-account-read-only-multisig-safe.js';
