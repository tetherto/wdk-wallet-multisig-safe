/** @typedef {import('ethers').Provider} Provider */
/** @typedef {import('@tetherto/wdk-wallet-evm').FeeRates} FeeRates */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletConfig} MultisigSafeWalletConfig */
/**
 * Wallet manager for multisig Safe wallets with ERC-4337 support.
 *
 */
export default class WalletManagerMultisigSafe extends WalletManager {
    /**
     * Creates a new wallet manager for multisig Safe wallets.
     *
     * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {MultisigSafeWalletConfig} config - The configuration object
     */
    constructor(seed: string | Uint8Array, config: MultisigSafeWalletConfig);
    /**
     * An ethers provider to interact with a node of the blockchain.
     *
     * @protected
     * @type {Provider | undefined}
     */
    protected _provider: Provider | undefined;
    /**
     * Returns the wallet account at a specific index.
     *
     * @example
     * // Returns the account with derivation path m/44'/60'/0'/0/1
     * const account = await wallet.getAccount(1);
     * @param {number} [index=0] - The index of the account to get
     * @returns {Promise<WalletAccountMultisigSafe>} The account
     */
    getAccount(index?: number): Promise<WalletAccountMultisigSafe>;
    /**
     * Returns the wallet account at a specific BIP-44 derivation path.
     *
     * @example
     * // Returns the account with derivation path m/44'/60'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0")
     * @returns {Promise<WalletAccountMultisigSafe>} The account
     */
    getAccountByPath(path: string): Promise<WalletAccountMultisigSafe>;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<FeeRates>} The fee rates (in wei)
     */
    getFeeRates(): Promise<FeeRates>;
    /**
     * Disposes the wallet accounts, erasing their private keys from memory. The seed is never wiped: the manager keeps it
     * in `seed`, and a seed phrase string you passed in stays in memory until it is garbage collected.
     */
    dispose(): void;
}
export type Provider = import("ethers").Provider;
export type FeeRates = import("@tetherto/wdk-wallet-evm").FeeRates;
export type MultisigSafeWalletConfig = import("./wallet-account-read-only-multisig-safe.js").MultisigSafeWalletConfig;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountMultisigSafe from './wallet-account-multisig-safe.js';
