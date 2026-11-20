// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import WalletManager from '@tetherto/wdk-wallet'

import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { BrowserProvider, JsonRpcProvider } from 'ethers'

import WalletAccountMultisigSafe from './wallet-account-multisig-safe.js'

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
  constructor (seed, config) {
    super(seed, config)

    /**
     * The multisig Safe configuration.
     *
     * @protected
     * @type {MultisigSafeWalletConfig}
     */
    this._config = config

    const { provider } = config

    if (provider) {
      /**
       * An ethers provider to interact with a node of the blockchain.
       *
       * @protected
       * @type {Provider | undefined}
       */
      this._provider = typeof provider === 'string'
        ? new JsonRpcProvider(provider)
        : new BrowserProvider(provider)
    }
  }

  /**
   * Returns the wallet account at a specific index.
   *
   * @example
   * // Returns the account with derivation path m/44'/60'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index=0] - The index of the account to get
   * @returns {Promise<WalletAccountMultisigSafe>} The account
   */
  async getAccount (index = 0) {
    return await this.getAccountByPath(`0'/0/${index}`)
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/60'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0")
   * @returns {Promise<WalletAccountMultisigSafe>} The account
   */
  async getAccountByPath (path) {
    if (!this._accounts[path]) {
      const account = new WalletAccountMultisigSafe(this.seed, path, this._config)

      this._accounts[path] = account
    }

    return this._accounts[path]
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<FeeRates>} The fee rates (in wei)
   */
  async getFeeRates () {
    if (!this._provider) {
      throw new Error('The wallet must be connected to a provider to get fee rates.')
    }

    const { maxFeePerGas } = await this._provider.getFeeData()

    return {
      normal: maxFeePerGas * WalletManagerEvm._FEE_RATE_NORMAL_MULTIPLIER / 100n,
      fast: maxFeePerGas * WalletManagerEvm._FEE_RATE_FAST_MULTIPLIER / 100n
    }
  }

  /**
   * Disposes the wallet accounts, erasing their private keys from memory. The seed is never wiped: the manager keeps it
   * in `seed`, and a seed phrase string you passed in stays in memory until it is garbage collected.
   */
  dispose () {
    for (const account of Object.values(this._accounts)) {
      account.dispose()
    }

    this._accounts = {}
  }
}
