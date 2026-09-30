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

import { keccak256, toUtf8Bytes, hashMessage, Interface, JsonRpcProvider, toQuantity } from 'ethers'

import { WalletAccountReadOnly, InvalidTokenError, NoSuchElementError, ValueError } from '@tetherto/wdk-wallet'

import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm'

import {
  // eslint-disable-next-line camelcase
  SafeAccountV0_2_0 as SafeAccount020,
  AbstractionKitError,
  Bundler,
  Erc7677Paymaster,
  ENTRYPOINT_V6,
  fetchAccountNonce,
  calculateUserOperationMaxGasCost
} from 'abstractionkit'

import SafeTxServiceCoordinator from './coordinators/safe-tx-service.js'

import { ConfigurationError } from './errors.js'

/** @typedef {import('ethers').Eip1193Provider} Eip1193Provider */

/** @typedef {import('./coordinators/i-multisig-coordinator.js').IMultisigCoordinator} IMultisigCoordinator */

/** @typedef {import('@tetherto/wdk-wallet/multisig').IWalletAccountReadOnlyMultisig} IWalletAccountReadOnlyMultisig */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInfo} MultisigInfo */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransactionReceipt} EvmTransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferOptions} TransferOptions */

/** @typedef {import('abstractionkit').UserOperationV7} UserOperationV7 */
/** @typedef {import('abstractionkit').UserOperationReceiptResult} UserOperationReceipt */
/** @typedef {import('abstractionkit').SafeAccountV0_2_0} SafeAccount */
/** @typedef {import('abstractionkit').TokenQuote} TokenQuote */

/**
 * @typedef {Object} ExistingSafeOptions
 * @property {string} safeAddress - The address of an already-deployed Safe.
 */

/**
 * @typedef {Object} PredictedSafeOptions
 * @property {string[]} owners - The Safe owners' addresses.
 * @property {number} threshold - The number of confirmations required to execute an operation.
 * @property {string} [saltNonce] - Deterministic salt nonce (hex). Defaults to a value derived from owners and threshold.
 */

/**
 * @typedef {Object} BuiltUserOperation
 * @property {UserOperationV7} userOp - The fully-populated UserOperation ready to sign.
 * @property {SafeAccount} smartAccount - The Safe account that will execute the operation.
 * @property {'native' | 'sponsored' | 'token'} mode - The paymaster mode used to build the operation.
 * @property {bigint} chainId - The chain id captured at build time.
 * @property {TokenQuote} [tokenQuote] - The paymaster token quote, present only in token mode.
 */

/**
 * @typedef {Object} MultisigSafeWalletCommonConfig
 * @property {string | Eip1193Provider} provider - RPC URL or EIP-1193 provider
 * @property {string} bundlerUrl - ERC-4337 bundler URL
 * @property {bigint} chainId - Chain ID
 * @property {string} [entryPointAddress] - EntryPoint contract address (defaults to the v0.6 EntryPoint)
 * @property {string} [safeModulesVersion='0.2.0'] - Safe modules version (EntryPoint v0.6)
 * @property {string} [paymasterUrl] - Paymaster service URL (any ERC-7677 paymaster)
 * @property {string} [txServiceUrl] - Custom Safe Transaction Service URL
 * @property {string} [safeApiKey] - Safe API key
 * @property {IMultisigCoordinator} [coordinator] - Coordinator used to share multisig calldata between signers. Defaults to a SafeTxServiceCoordinator built from `txServiceUrl`/`safeApiKey`.
 * @property {ExistingSafeOptions | PredictedSafeOptions} safeOptions - Safe options (existing or predicted)
 */

/**
 * @typedef {Object} MultisigSafeWalletPaymasterTokenConfig
 * @property {false} [isSponsored] - Whether the paymaster is sponsoring the account.
 * @property {false} [useNativeCoins] - Whether to use native coins instead of a paymaster to pay for gas fees.
 * @property {string} [paymasterAddress] - Paymaster contract address (only required for unknown paymaster providers)
 * @property {string} paymasterTokenAddress - The address of the paymaster token.
 * @property {number | bigint} [transferMaxFee] - Maximum fee for transfers
 * @property {number | bigint} [amountToApprove] - Amount to approve for paymaster
 */

/**
 * @typedef {Object} MultisigSafeWalletSponsoredConfig
 * @property {true} isSponsored - Whether the paymaster is sponsoring the account.
 * @property {false} [useNativeCoins] - Whether to use native coins instead of a paymaster to pay for gas fees.
 * @property {string} [sponsorshipPolicyId] - Sponsorship policy ID
 */

/**
 * @typedef {Object} MultisigSafeWalletNativeCoinsConfig
 * @property {false} [isSponsored] - Whether the paymaster is sponsoring the account.
 * @property {true} useNativeCoins - Whether to use native coins instead of a paymaster to pay for gas fees.
 * @property {number | bigint} [transferMaxFee] - Maximum fee for transfers
 */

/**
 * @typedef {MultisigSafeWalletCommonConfig & (MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig)} MultisigSafeWalletConfig
 */

/** @typedef {Omit<MultisigSafeWalletConfig, 'transferMaxFee' | 'amountToApprove'>} MultisigSafeWalletReadOnlyConfig */

export const DEFAULT_SAFE_MODULES_VERSION = '0.2.0'
export const DEFAULT_SAFE_VERSION = '1.4.1'

const SAFE_MODULES_MAP = {
  '0.2.0': {
    safe4337ModuleAddress: '0xa581c4A4DB7175302464fF3C06380BC3270b4037',
    safeModuleSetupAddress: '0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb'
  }
}

const PaymasterMode = {
  NATIVE: 'native',
  SPONSORED: 'sponsored',
  TOKEN: 'token'
}

const EIP1271_MAGIC_VALUE = '0x1626ba7e'

// Paymaster exchange rates are scaled by 10^18: the value of one native coin in the token's smallest unit.
const EXCHANGE_RATE_SCALE = 10n ** 18n

/**
 * Read-only multisig Safe wallet account.
 * Provides query-only operations for Safe multisig wallets.
 *
 * @implements {IWalletAccountReadOnlyMultisig}
 */
export default class WalletAccountReadOnlyMultisigSafe extends WalletAccountReadOnly {
  /**
   * Creates a new read-only multisig Safe wallet account.
   *
   * @param {MultisigSafeWalletReadOnlyConfig} config - The configuration object
   * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
   */
  constructor (config) {
    super(undefined)
    this._validateConfig(config)

    /**
     * The multisig Safe configuration.
     *
     * @protected
     * @type {MultisigSafeWalletReadOnlyConfig}
     */
    this._config = config

    /**
     * The Safe address.
     *
     * @protected
     * @type {string | null}
     */
    this._safeAddress = config.safeOptions?.safeAddress || null

    /**
     * The coordinator used to share multisig calldata between signers.
     *
     * @protected
     * @type {IMultisigCoordinator}
     */
    this._coordinator = config.coordinator ?? new SafeTxServiceCoordinator({
      chainId: config.chainId,
      txServiceUrl: config.txServiceUrl,
      apiKey: config.safeApiKey
    })

    /**
     * An EIP-1193-compatible provider used to interact with the blockchain.
     *
     * @protected
     * @type {Eip1193Provider}
     */
    this._provider = this._wrapEip1193Provider(config.provider)

    /**
     * Cached AbstractionKit bundler.
     *
     * @protected
     * @type {Bundler | undefined}
     */
    this._bundler = undefined

    /**
     * Cached Erc7677Paymaster instances keyed by URL.
     *
     * @protected
     * @type {Map<string, Erc7677Paymaster>}
     */
    this._paymasters = new Map()

    /**
     * Cached deployed Safe account instance.
     *
     * @protected
     * @type {SafeAccount | undefined}
     */
    this._deployedSmartAccount = undefined

    /**
     * Cached owners list.
     *
     * @protected
     * @type {string[] | null}
     */
    this._owners = null

    /**
     * Cached threshold.
     *
     * @protected
     * @type {number | null}
     */
    this._threshold = null
  }

  /**
   * Generates a deterministic salt nonce from owners and threshold.
   *
   * @static
   * @param {string[]} owners - Array of owner addresses
   * @param {number} threshold - Number of required signatures
   * @returns {string} The deterministic salt nonce (hex string)
   */
  static generateDeterministicSaltNonce (owners, threshold) {
    const sortedOwners = [...owners].map(o => o.toLowerCase()).sort()
    const data = JSON.stringify({ owners: sortedOwners, threshold })
    return keccak256(toUtf8Bytes(data))
  }

  /**
   * Returns the predicted Safe address.
   *
   * @returns {Promise<string>} The Safe address
   */
  async getAddress () {
    if (this._safeAddress) {
      return this._safeAddress
    }

    const { owners } = this._config.safeOptions
    const overrides = this._getInitCodeOverrides()

    this._safeAddress = SafeAccount020.createAccountAddress(owners, overrides)

    return this._safeAddress
  }

  /**
   * Checks if the Safe is deployed on-chain.
   *
   * @returns {Promise<boolean>} True if deployed
   */
  async isDeployed () {
    const safeAddress = await this.getAddress()
    return await SafeAccount020.isDeployed(safeAddress, this._provider)
  }

  /**
   * Returns the list of Safe owners.
   *
   * @returns {Promise<string[]>} Array of owner addresses
   * @throws {ValueError} If the Safe is not deployed and no owners are provided in the configuration.
   */
  async getOwners () {
    if (this._owners) {
      return this._owners
    }

    const isDeployed = await this.isDeployed()

    if (isDeployed) {
      const smartAccount = await this._getSmartAccount()
      this._owners = await smartAccount.getOwners(this._provider)
    } else {
      if (!this._config.safeOptions?.owners) {
        throw new ValueError('Safe is not deployed and no owners provided in options')
      }
      this._owners = this._config.safeOptions.owners
    }

    return this._owners
  }

  /**
   * Returns the Safe threshold.
   *
   * @returns {Promise<number>} The threshold
   * @throws {ValueError} If the Safe is not deployed and no threshold is provided in the configuration.
   */
  async getThreshold () {
    if (this._threshold !== null) {
      return this._threshold
    }

    const isDeployed = await this.isDeployed()

    if (isDeployed) {
      const smartAccount = await this._getSmartAccount()
      this._threshold = await smartAccount.getThreshold(this._provider)
    } else {
      if (!this._config.safeOptions?.threshold) {
        throw new ValueError('Safe is not deployed and no threshold provided in options')
      }
      this._threshold = this._config.safeOptions.threshold
    }

    return this._threshold
  }

  /**
   * Returns the multisig wallet info.
   *
   * @returns {Promise<MultisigInfo>} The multisig info
   */
  async getMultisigInfo () {
    const address = await this.getAddress()
    const owners = await this.getOwners()
    const threshold = await this.getThreshold()

    return {
      address,
      owners,
      threshold
    }
  }

  /**
   * Returns the Safe's current ERC-4337 nonce (the EntryPoint nonce used for UserOperations).
   *
   * @returns {Promise<bigint>} The nonce
   */
  async getNonce () {
    const safeAddress = await this.getAddress()
    return await fetchAccountNonce(this._provider, this._entryPointAddress(), safeAddress)
  }

  /**
   * Returns the Safe contract version.
   *
   * @returns {Promise<string>} The Safe version (e.g., "1.4.1")
   */
  async getVersion () {
    const isDeployed = await this.isDeployed()

    if (!isDeployed) {
      return 'not deployed'
    }

    const safeAddress = await this.getAddress()
    const iface = new Interface(['function VERSION() view returns (string)'])
    const data = iface.encodeFunctionData('VERSION', [])
    const raw = await this._provider.request({ method: 'eth_call', params: [{ to: safeAddress, data }, 'latest'] })
    const [version] = iface.decodeFunctionResult('VERSION', raw)

    return version
  }

  /**
   * Returns the Safe's native token balance.
   *
   * @returns {Promise<bigint>} Balance in wei
   */
  async getBalance () {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()
    return await evmReadOnlyAccount.getBalance()
  }

  /**
   * Returns the Safe's balance for a specific ERC-20 token.
   *
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<bigint>} Token balance in base units
   */
  async getTokenBalance (tokenAddress) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()
    return await evmReadOnlyAccount.getTokenBalance(tokenAddress)
  }

  /**
   * Returns a transaction's receipt. Supports both regular transaction hashes
   * and UserOperation hashes (from the ERC-4337 bundler).
   *
   * @param {string} hash - The transaction hash or UserOperation hash
   * @returns {Promise<EvmTransactionReceipt | UserOperationReceipt | null>} The receipt, or null if not yet included in a block
   */
  async getTransactionReceipt (hash) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()
    const receipt = await evmReadOnlyAccount.getTransactionReceipt(hash)
    if (receipt) return receipt

    return await this._getBundler().getUserOperationReceipt(hash)
  }

  /**
   * Verifies a message's signature using EIP-1271.
   *
   * @param {string} message - The original message
   * @param {string} signature - The signature to verify
   * @returns {Promise<boolean>} True if the signature is valid
   */
  async verify (message, signature) {
    const safeAddress = await this.getAddress()
    const messageHash = hashMessage(message)
    const iface = new Interface(['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'])
    const data = iface.encodeFunctionData('isValidSignature', [messageHash, signature])

    try {
      const raw = await this._provider.request({ method: 'eth_call', params: [{ to: safeAddress, data }, 'latest'] })
      return raw.slice(0, 10).toLowerCase() === EIP1271_MAGIC_VALUE
    } catch (error) {
      if (error.code === 'CALL_EXCEPTION' || /revert/i.test(error.message ?? '')) {
        return false
      }
      throw error
    }
  }

  /**
   * Returns the Safe's paymaster token balance.
   *
   * @returns {Promise<bigint>} Paymaster token balance
   * @throws {Error} If no paymaster token is configured
   */
  async getPaymasterTokenBalance () {
    const paymasterTokenAddress = this._config.paymasterTokenAddress

    if (!paymasterTokenAddress) {
      throw new Error("The account has no 'paymasterTokenAddress' configured.")
    }

    return await this.getTokenBalance(paymasterTokenAddress)
  }

  /**
   * Returns a proposal by its identifier.
   *
   * @param {string} proposalId - The proposal's identifier
   * @returns {Promise<MultisigProposal | null>} The proposal details, or null if the proposal has not been found.
   */
  async getProposal (proposalId) {
    const safeOperation = await this._coordinator.getProposal(proposalId)

    if (!safeOperation) {
      return null
    }

    const threshold = await this.getThreshold()

    return {
      proposalId,
      confirmations: safeOperation.confirmations?.length || 0,
      threshold,
      status: safeOperation.userOperation?.ethereumTxHash ? 'executed' : 'pending'
    }
  }

  /**
   * Returns a map from each proposal identifier to its details.
   *
   * @param {string[]} proposalIds - The list of proposal identifiers
   * @returns {Promise<Record<string, MultisigProposal | null>>} For each proposal id, the proposal details or null if it has not been found.
   */
  async getProposals (proposalIds) {
    const entries = await Promise.all(
      proposalIds.map(async (proposalId) => [proposalId, await this.getProposal(proposalId)])
    )

    return Object.fromEntries(entries)
  }

  /**
   * Checks if a Safe operation is ready to be executed.
   *
   * @param {string} proposalId - The Safe operation hash
   * @returns {Promise<boolean>} True if confirmations >= threshold
   */
  async isReadyToExecute (proposalId) {
    const operation = await this.getProposal(proposalId)

    if (!operation) {
      return false
    }

    return operation.confirmations >= operation.threshold
  }

  /**
   * Returns a message proposal by its identifier.
   *
   * @param {string} messageId - The message's hash
   * @returns {Promise<MultisigMessageProposal | null>} The message details, or null if the message has not been found.
   */
  async getMessageProposal (messageId) {
    const safeMessage = await this._coordinator.getMessage(messageId)

    if (!safeMessage) {
      return null
    }

    const threshold = await this.getThreshold()

    return {
      messageId,
      message: safeMessage.message,
      confirmations: safeMessage.confirmations?.length || 0,
      threshold,
      combinedSignature: safeMessage.preparedSignature || null
    }
  }

  /**
   * Returns a map from each message hash to its details.
   *
   * @param {string[]} messageIds - The list of message hashes
   * @returns {Promise<Record<string, MultisigMessageProposal | null>>} For each message hash, the message details or null if it has not been found.
   */
  async getMessageProposals (messageIds) {
    const entries = await Promise.all(
      messageIds.map(async (messageId) => [messageId, await this.getMessageProposal(messageId)])
    )

    return Object.fromEntries(entries)
  }

  /**
   * Estimates the gas cost for deploying the Safe.
   *
   * @returns {Promise<{fee: bigint}>} Estimated deployment fee in wei
   * @throws {Error} If Safe is already deployed
   */
  async quoteDeploy () {
    const isDeployed = await this.isDeployed()

    if (isDeployed) {
      throw new Error('Safe is already deployed')
    }

    const deploymentTx = this._buildDeploymentTransaction()

    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()
    return await evmReadOnlyAccount.quoteSendTransaction(deploymentTx)
  }

  /**
   * Estimates the fee for a transaction.
   *
   * @param {EvmTransaction} tx - The transaction
   * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
   * @returns {Promise<{fee: bigint}>} Estimated fee in paymaster token units or wei
   * @throws {Error} If the token paymaster reports that the Safe does not hold the paymaster token.
   */
  async quoteSendTransaction (tx, config) {
    const mergedConfig = { ...this._config, ...config }

    if (mergedConfig.isSponsored) {
      return { fee: 0n }
    }

    const { fee } = await this._getUserOperationGasCost([tx].flat(), mergedConfig)

    return { fee }
  }

  /**
   * Estimates the fee for a token transfer.
   *
   * @param {TransferOptions} transferOptions - Transfer options
   * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
   * @returns {Promise<{fee: bigint}>} Estimated fee in paymaster token units or wei
   */
  async quoteTransfer (transferOptions, config) {
    const tx = await WalletAccountReadOnlyEvm._getTransferTransaction(transferOptions)
    return await this.quoteSendTransaction(tx, config)
  }

  /**
   * Quotes the on-chain cost of executing a pending proposal. The fee is expressed in the asset the Safe pays gas
   * with: zero when sponsored, paymaster token units when paying with a token, wei otherwise.
   *
   * @param {string} proposalId - The proposal's id
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The execution cost estimate
   * @throws {NoSuchElementError} If no proposal exists for the given id.
   * @throws {InvalidTokenError} If the paymaster does not support the token in the 'paymasterTokenAddress' option.
   */
  async quoteExecuteProposal (proposalId) {
    const safeOperation = await this._coordinator.getProposal(proposalId)

    if (!safeOperation) {
      throw new NoSuchElementError(`SafeOperation not found: ${proposalId}`)
    }

    const userOp = this._rebuildUserOperation(safeOperation.userOperation)

    return { fee: await this._getExecutionFee(userOp) }
  }

  /**
   * Coerces a stored UserOperation's numeric fields back to BigInt (a coordinator may serialize them as strings).
   *
   * @protected
   * @param {UserOperationV7} userOperation - The stored UserOperation.
   * @returns {UserOperationV7} The UserOperation with BigInt numeric fields.
   */
  _rebuildUserOperation (userOperation) {
    const toBigInt = (value) => (value === undefined || value === null) ? value : BigInt(value)

    return {
      ...userOperation,
      nonce: toBigInt(userOperation.nonce),
      callGasLimit: toBigInt(userOperation.callGasLimit),
      verificationGasLimit: toBigInt(userOperation.verificationGasLimit),
      preVerificationGas: toBigInt(userOperation.preVerificationGas),
      maxFeePerGas: toBigInt(userOperation.maxFeePerGas),
      maxPriorityFeePerGas: toBigInt(userOperation.maxPriorityFeePerGas),
      paymasterVerificationGasLimit: toBigInt(userOperation.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: toBigInt(userOperation.paymasterPostOpGasLimit)
    }
  }

  /**
   * Returns the maximum cost of executing a user operation, in the asset the Safe pays gas with: zero when the
   * account is sponsored, paymaster token units when the account pays with a token and the operation carries a
   * paymaster, and wei otherwise.
   *
   * @protected
   * @param {UserOperationV7} userOperation - The user operation to execute.
   * @returns {Promise<bigint>} The maximum execution cost.
   * @throws {InvalidTokenError} If the paymaster does not support the token in the 'paymasterTokenAddress' option.
   */
  async _getExecutionFee (userOperation) {
    const maxGasCost = this._getMaxGasCost(userOperation)

    if (!WalletAccountReadOnlyMultisigSafe._hasPaymaster(userOperation)) return maxGasCost

    const mode = WalletAccountReadOnlyMultisigSafe._resolvePaymasterMode(this._config)

    if (mode === PaymasterMode.SPONSORED) return 0n
    if (mode === PaymasterMode.NATIVE) return maxGasCost

    const exchangeRate = await this._fetchPaymasterExchangeRate()

    return exchangeRate === null ? maxGasCost : exchangeRate * maxGasCost / EXCHANGE_RATE_SCALE
  }

  /** @private */
  async _fetchPaymasterExchangeRate () {
    const { paymasterUrl, paymasterTokenAddress, chainId } = this._config
    const provider = WalletAccountReadOnlyMultisigSafe._detectProvider(paymasterUrl)

    if (provider === null) return null

    const paymaster = this._getPaymaster(paymasterUrl, { chainId: BigInt(chainId) })
    const entrypoint = this._entryPointAddress()

    if (provider === 'pimlico') {
      const params = [{ tokens: [paymasterTokenAddress] }, entrypoint, toQuantity(chainId)]
      const { quotes } = await paymaster.sendRPCRequest('pimlico_getTokenQuotes', params)
      return WalletAccountReadOnlyMultisigSafe._findExchangeRate('token', paymasterTokenAddress, quotes)
    }

    const { tokens } = await paymaster.sendRPCRequest('pm_supportedERC20Tokens', [entrypoint])
    return WalletAccountReadOnlyMultisigSafe._findExchangeRate('address', paymasterTokenAddress, tokens)
  }

  /** @private */
  _getMaxGasCost (userOperation) {
    const cost = calculateUserOperationMaxGasCost(userOperation)

    if (!WalletAccountReadOnlyMultisigSafe._hasPaymaster(userOperation)) {
      return cost + userOperation.verificationGasLimit * userOperation.maxFeePerGas
    }

    return cost
  }

  /**
   * Builds an unsigned UserOperation from the given transaction(s), applying the configured paymaster.
   *
   * This is the shared method used by both fee estimation and proposal creation so they operate on
   * the same UserOperation structure.
   *
   * @protected
   * @param {EvmTransaction | EvmTransaction[]} transaction - The transaction(s)
   * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
   * @returns {Promise<BuiltUserOperation>} The built operation and signing context.
   */
  async _createSafeOperation (transaction, config) {
    const transactions = Array.isArray(transaction) ? transaction : [transaction]
    const calls = WalletAccountReadOnlyMultisigSafe._toMetaTransactions(transactions)
    const txOverrides = WalletAccountReadOnlyMultisigSafe._extractGasOverrides(transactions[0])

    return await this._buildUserOperation(calls, { ...this._config, ...config }, txOverrides)
  }

  /**
   * Builds a UserOperation with paymaster fields applied.
   *
   * @protected
   * @param {import('abstractionkit').MetaTransaction[]} calls - The meta-transactions to include in the UserOperation.
   * @param {MultisigSafeWalletConfig} config - The merged wallet configuration.
   * @param {Object} [txOverrides] - Optional gas overrides extracted from the input transaction(s).
   * @returns {Promise<BuiltUserOperation>} The built operation, signing context, and (in token mode) the paymaster quote.
   */
  async _buildUserOperation (calls, config, txOverrides = {}) {
    const smartAccount = await this._getSmartAccount()
    const chainId = this._config.chainId

    const mode = WalletAccountReadOnlyMultisigSafe._resolvePaymasterMode(config)
    const provider = mode !== PaymasterMode.NATIVE
      ? WalletAccountReadOnlyMultisigSafe._detectProvider(config.paymasterUrl)
      : null

    const gasPrice = await this._fetchBundlerGasPrice(config.bundlerUrl)
    const expectedSigners = await this._getExpectedSigners()

    const feePairOverridden = txOverrides.maxFeePerGas !== undefined || txOverrides.maxPriorityFeePerGas !== undefined
    const baseOverrides = feePairOverridden ? { ...txOverrides } : { ...gasPrice, ...txOverrides }
    const overrides = { ...baseOverrides, expectedSigners }

    if (config.customNonce !== undefined) {
      overrides.nonce = BigInt(config.customNonce)
    }

    const baseUserOp = (mode === PaymasterMode.NATIVE || provider === 'candide')
      ? await smartAccount.createUserOperation(calls, this._provider, config.bundlerUrl, overrides)
      : await smartAccount.createUserOperation(calls, this._provider, undefined, { skipGasEstimation: true, ...overrides })

    if (mode === PaymasterMode.NATIVE) {
      return { userOp: baseUserOp, smartAccount, mode, chainId }
    }

    const { userOp, tokenQuote } = await this._applyPaymasterToUserOp({ mode, smartAccount, userOp: baseUserOp, config, chainId, txOverrides })
    return { userOp, smartAccount, mode, chainId, tokenQuote }
  }

  /**
   * Builds a UserOperation and returns its estimated gas cost.
   *
   * Returns the cost in the paymaster token when a token quote is available, otherwise in native wei.
   *
   * @protected
   * @param {EvmTransaction[]} txs - The EVM transactions to include in the UserOperation.
   * @param {MultisigSafeWalletConfig} config - The merged wallet configuration.
   * @returns {Promise<BuiltUserOperation & {fee: bigint}>} The built operation plus its estimated fee.
   * @throws {Error} If the token paymaster reports that the Safe does not hold the paymaster token.
   */
  async _getUserOperationGasCost (txs, config) {
    const calls = WalletAccountReadOnlyMultisigSafe._toMetaTransactions(txs)
    const txOverrides = WalletAccountReadOnlyMultisigSafe._extractGasOverrides(txs[0])

    try {
      const buildResult = await this._buildUserOperation(calls, config, txOverrides)

      const fee = buildResult.tokenQuote
        ? buildResult.tokenQuote.tokenCost
        : this._getMaxGasCost(buildResult.userOp)

      return { fee, ...buildResult }
    } catch (error) {
      if (error instanceof AbstractionKitError && error.message.includes('AA50')) {
        throw new Error('Simulation failed: not enough funds in the Safe to repay the paymaster.')
      }
      throw error
    }
  }

  /**
   * Builds the Safe deployment transaction (an EOA-funded factory call).
   *
   * @protected
   * @returns {{to: string, value: bigint, data: string}} The deployment transaction.
   */
  _buildDeploymentTransaction () {
    const { owners } = this._config.safeOptions
    const overrides = this._getInitCodeOverrides()
    const smartAccount = SafeAccount020.initializeNewAccount(owners, overrides)

    return {
      to: smartAccount.factoryAddress,
      value: 0n,
      data: smartAccount.factoryData
    }
  }

  /**
   * Returns a Safe account instance, cached once deployed.
   *
   * @protected
   * @returns {Promise<SafeAccount>} The Safe account instance.
   */
  async _getSmartAccount () {
    if (this._deployedSmartAccount) {
      return this._deployedSmartAccount
    }

    const overrides = this._getInitCodeOverrides()
    const safeAddress = await this.getAddress()

    if (await SafeAccount020.isDeployed(safeAddress, this._provider)) {
      this._deployedSmartAccount = new SafeAccount020(safeAddress, overrides)
      return this._deployedSmartAccount
    }

    return SafeAccount020.initializeNewAccount(this._config.safeOptions.owners, overrides)
  }

  /**
   * Returns an AbstractionKit Bundler, cached on first use.
   *
   * @protected
   * @returns {Bundler} The bundler.
   */
  _getBundler () {
    if (!this._bundler) {
      this._bundler = new Bundler(this._config.bundlerUrl)
    }
    return this._bundler
  }

  /**
   * Returns a read-only EVM account for the Safe address.
   *
   * @private
   * @returns {Promise<WalletAccountReadOnlyEvm>} The read-only EVM account
   */
  async _getEvmReadOnlyAccount () {
    const address = await this.getAddress()
    return new WalletAccountReadOnlyEvm(address, this._config)
  }

  /**
   * Resets cached internal state.
   *
   * @protected
   */
  _resetState () {
    this._owners = null
    this._threshold = null
    this._deployedSmartAccount = undefined
  }

  /** @private */
  _entryPointAddress () {
    return this._config.entryPointAddress || ENTRYPOINT_V6
  }

  /** @private */
  _getInitCodeOverrides () {
    const modules = SAFE_MODULES_MAP[this._config.safeModulesVersion || DEFAULT_SAFE_MODULES_VERSION]

    const overrides = {
      entrypointAddress: this._entryPointAddress(),
      safe4337ModuleAddress: modules.safe4337ModuleAddress,
      safeModuleSetupAddress: modules.safeModuleSetupAddress
    }

    const { owners, threshold, saltNonce } = this._config.safeOptions

    if (owners && threshold) {
      overrides.threshold = threshold
      const finalSaltNonce = saltNonce ||
        WalletAccountReadOnlyMultisigSafe.generateDeterministicSaltNonce(owners, threshold)
      overrides.c2Nonce = BigInt(finalSaltNonce)
    }

    return overrides
  }

  /**
   * Returns the SafeOperation EIP-712 hashing options shared by propose, approve and execute.
   *
   * The same options must be used everywhere a SafeOperation hash is computed and everywhere
   * signatures are aggregated, otherwise the combined signature will not recover to the owners.
   *
   * @protected
   * @returns {{validAfter: bigint, validUntil: bigint, entrypointAddress: string, safe4337ModuleAddress: string}} The shared SafeOperation options.
   */
  _getSafeOperationOptions () {
    const { entrypointAddress, safe4337ModuleAddress } = this._getInitCodeOverrides()
    return { validAfter: 0n, validUntil: 0n, entrypointAddress, safe4337ModuleAddress }
  }

  /** @private */
  async _getExpectedSigners () {
    const owners = await this.getOwners()
    const threshold = await this.getThreshold()
    return owners.slice(0, threshold)
  }

  /** @private */
  _wrapEip1193Provider (provider) {
    return typeof provider === 'string'
      ? {
          provider: new JsonRpcProvider(provider),
          request ({ method, params }) {
            return this.provider.send(method, params ?? [])
          }
        }
      : provider
  }

  /** @private */
  _getPaymaster (url, options = {}) {
    if (!this._paymasters.has(url)) {
      const provider = WalletAccountReadOnlyMultisigSafe._detectProvider(url)
      this._paymasters.set(url, new Erc7677Paymaster(url, { ...options, provider }))
    }
    return this._paymasters.get(url)
  }

  /** @private */
  async _fetchBundlerGasPrice (bundlerUrl) {
    if (WalletAccountReadOnlyMultisigSafe._detectProvider(bundlerUrl) !== 'pimlico') return undefined

    const paymaster = this._getPaymaster(bundlerUrl)
    const result = await paymaster.sendRPCRequest('pimlico_getUserOperationGasPrice', [])
    if (!result?.fast) return undefined

    return {
      maxFeePerGas: BigInt(result.fast.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(result.fast.maxPriorityFeePerGas)
    }
  }

  /** @private */
  async _applyPaymasterToUserOp ({ mode, smartAccount, userOp, config, chainId, txOverrides = {} }) {
    const paymaster = this._getPaymaster(config.paymasterUrl, { chainId: BigInt(chainId) })

    const context = mode === PaymasterMode.TOKEN
      ? { token: config.paymasterTokenAddress }
      : { sponsorshipPolicyId: config.sponsorshipPolicyId }

    const paymasterOverrides = { entrypoint: this._entryPointAddress() }
    if (txOverrides.callGasLimit !== undefined) paymasterOverrides.callGasLimit = txOverrides.callGasLimit
    if (txOverrides.verificationGasLimit !== undefined) paymasterOverrides.verificationGasLimit = txOverrides.verificationGasLimit
    if (txOverrides.preVerificationGas !== undefined) paymasterOverrides.preVerificationGas = txOverrides.preVerificationGas

    const result = await paymaster.createPaymasterUserOperation(
      smartAccount,
      userOp,
      config.bundlerUrl,
      context,
      paymasterOverrides
    )

    return { userOp: result.userOperation, tokenQuote: result.tokenQuote }
  }

  /** @private */
  static _toMetaTransactions (txs) {
    return txs.map(tx => ({
      to: tx.to,
      value: tx.value !== undefined ? BigInt(tx.value) : 0n,
      data: tx.data ?? '0x'
    }))
  }

  /** @private */
  static _extractGasOverrides (tx) {
    const overrides = {}
    if (!tx) return overrides

    const fields = ['callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas']
    for (const field of fields) {
      if (tx[field] !== undefined) overrides[field] = BigInt(tx[field])
    }

    return overrides
  }

  /** @private */
  static _hasPaymaster (userOperation) {
    return userOperation.paymasterAndData !== undefined && userOperation.paymasterAndData !== '0x'
  }

  /** @private */
  static _findExchangeRate (addressField, tokenAddress, quotes) {
    const quote = quotes.find(candidate => candidate[addressField].toLowerCase() === tokenAddress.toLowerCase())

    if (quote === undefined) {
      throw new InvalidTokenError(`The paymaster does not support the token set in the 'paymasterTokenAddress' option: ${tokenAddress}.`)
    }

    return BigInt(quote.exchangeRate)
  }

  /** @private */
  static _resolvePaymasterMode (config) {
    if (config.isSponsored) return PaymasterMode.SPONSORED
    if (!config.useNativeCoins && config.paymasterUrl && config.paymasterTokenAddress) return PaymasterMode.TOKEN
    return PaymasterMode.NATIVE
  }

  /** @private */
  static _detectProvider (url) {
    const detected = Erc7677Paymaster.detectProvider(url)
    if (detected) return detected
    if (url?.includes('pimlico')) return 'pimlico'
    if (url?.includes('candide')) return 'candide'
    return null
  }

  /**
   * Validates the configuration.
   *
   * @private
   * @param {MultisigSafeWalletConfig} config - The configuration to validate
   * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
   */
  _validateConfig (config) {
    if (config.safeModulesVersion && !SAFE_MODULES_MAP[config.safeModulesVersion]) {
      throw new ConfigurationError(`Unsupported 'safeModulesVersion': '${config.safeModulesVersion}'. Supported versions: ${Object.keys(SAFE_MODULES_MAP).join(', ')}.`)
    }

    if (!config.safeOptions) {
      throw new ConfigurationError('safeOptions is required')
    }

    const safeOptions = config.safeOptions

    if (!safeOptions.safeAddress && !safeOptions.owners) {
      throw new ConfigurationError("safeOptions must provide either 'safeAddress' (existing Safe) or 'owners' (predicted Safe).")
    }

    const hasPredictedSafe = !!safeOptions.owners

    if (hasPredictedSafe) {
      if (!Array.isArray(safeOptions.owners) || safeOptions.owners.length === 0) {
        throw new ConfigurationError('safeOptions.owners is required and must not be empty')
      }

      if (!safeOptions.threshold || safeOptions.threshold < 1) {
        throw new ConfigurationError('safeOptions.threshold must be at least 1')
      }

      if (safeOptions.threshold > safeOptions.owners.length) {
        throw new ConfigurationError('safeOptions.threshold cannot exceed number of owners')
      }
    }

    const { isSponsored, useNativeCoins, paymasterUrl, paymasterTokenAddress } = config

    if (isSponsored && useNativeCoins) {
      throw new ConfigurationError("Cannot use both 'isSponsored: true' and 'useNativeCoins: true'. Please use only one.")
    }

    if (isSponsored && !paymasterUrl) {
      throw new ConfigurationError("The 'paymasterUrl' option is required when 'isSponsored' is set.")
    }

    if (!isSponsored && !useNativeCoins && paymasterUrl && !paymasterTokenAddress) {
      throw new ConfigurationError("The 'paymasterTokenAddress' option is required when a 'paymasterUrl' is configured.")
    }
  }
}
