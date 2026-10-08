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

import { TypedDataEncoder, getAddress } from 'ethers'

import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

import {
  // eslint-disable-next-line camelcase
  SafeAccountV0_2_0 as SafeAccount020,
  AbstractionKitError
} from 'abstractionkit'

import { toJsonSafe } from './coordinators/i-multisig-coordinator.js'

import { NoSuchElementError, SignerError, ValueError } from '@tetherto/wdk-wallet'

import { HashMismatchError } from './errors.js'
import WalletAccountReadOnlyMultisigSafe from './wallet-account-read-only-multisig-safe.js'

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

/** @typedef {import('abstractionkit').UserOperationV7} UserOperationV7 */

/** @typedef {import('./errors.js').ConfigurationError} ConfigurationError */

/**
 * An account that can act as one of the Safe's owners, including one from another installed copy of
 * @tetherto/wdk-wallet-evm.
 *
 * @typedef {Pick<WalletAccountEvm, 'getAddress' | 'signTypedData' | 'sendTransaction'>} MultisigSafeOwnerAccount
 */

/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletConfig} MultisigSafeWalletConfig */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletPaymasterTokenConfig} MultisigSafeWalletPaymasterTokenConfig */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletSponsoredConfig} MultisigSafeWalletSponsoredConfig */
/** @typedef {import('./wallet-account-read-only-multisig-safe.js').MultisigSafeWalletNativeCoinsConfig} MultisigSafeWalletNativeCoinsConfig */

const SENTINEL_OWNER = '0x0000000000000000000000000000000000000001'

/**
 * Multisig Safe wallet account with signing capabilities.
 * Provides full transaction and message signing operations.
 *
 * @implements {IWalletAccountMultisig}
 * @implements {IMultisigOwnerManagement}
 */
export default class WalletAccountMultisigSafe extends WalletAccountReadOnlyMultisigSafe {
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
  constructor (seedOrAccount, pathOrConfig, config) {
    const isSeed = typeof seedOrAccount === 'string' || seedOrAccount instanceof Uint8Array

    const [signerAccount, resolvedConfig] = isSeed
      ? [new WalletAccountEvm(seedOrAccount, pathOrConfig, config), config]
      : [seedOrAccount, pathOrConfig]

    super(resolvedConfig)

    /**
     * The multisig Safe configuration.
     *
     * @protected
     * @type {MultisigSafeWalletConfig}
     */
    this._config = resolvedConfig

    /**
     * The signer account.
     *
     * @private
     * @type {MultisigSafeOwnerAccount}
     */
    this._signerAccount = signerAccount

    /** @private */
    this._isExternalSignerAccount = !isSeed
  }

  /**
   * The derivation path's index of this account, or `undefined` when the owner account does not expose one.
   *
   * @type {number}
   */
  get index () {
    return this._signerAccount.index
  }

  /**
   * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)),
   * or `undefined` when the owner account does not expose one.
   *
   * @type {string}
   */
  get path () {
    return this._signerAccount.path
  }

  /**
   * The key pair of this account.
   *
   * @type {KeyPair}
   * @throws {Error} If the owner account does not expose its key material.
   */
  get keyPair () {
    return this._signerAccount.keyPair
  }

  /**
   * Returns the signer's address.
   *
   * @returns {Promise<string>} The signer's address.
   */
  async getSignerAddress () {
    return await this._signerAccount.getAddress()
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign
   * @returns {Promise<string>} The signature
   */
  async sign (message) {
    const result = await this.proposeMessage(message)
    return result.signature
  }

  /**
   * Signs a message with the multisig Safe.
   * Proposes a new message for the other owners to confirm.
   *
   * @param {string} message - The message to sign
   * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The sign result
   * @throws {SignerError} If the signer is not an owner of the Safe.
   */
  async proposeMessage (message) {
    await this.validateSignerIsOwner()

    const threshold = await this.getThreshold()
    const safeAddress = await this.getAddress()
    const smartAccount = await this._getSmartAccount()

    const { domain, types, messageValue } = smartAccount.getSafeMessageEip712Data(this._config.chainId, message)
    const messageId = this._getMessageId(domain, types, messageValue)
    const signature = await this._signTypedData({ domain, types, message: messageValue })

    await this._coordinator.submitMessage(safeAddress, messageId, { message, signature })

    const safeMessageResponse = await this._coordinator.getMessage(messageId)

    return {
      messageId,
      message,
      signature,
      confirmations: safeMessageResponse?.confirmations?.length || 0,
      threshold,
      combinedSignature: safeMessageResponse?.preparedSignature || null
    }
  }

  /**
   * Approves an existing message proposal.
   *
   * @param {string} messageId - The message hash to approve
   * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The approval result
   * @throws {SignerError} If the signer is not an owner of the Safe.
   * @throws {NoSuchElementError} If no message exists for the given hash.
   * @throws {HashMismatchError} If the message returned by the coordinator does not hash to the requested id.
   */
  async approveMessageProposal (messageId) {
    await this.validateSignerIsOwner()

    const existingMessage = await this._coordinator.getMessage(messageId)

    if (!existingMessage) {
      throw new NoSuchElementError(`Message not found: ${messageId}`)
    }

    const smartAccount = await this._getSmartAccount()
    const { domain, types, messageValue } = smartAccount.getSafeMessageEip712Data(this._config.chainId, existingMessage.message)

    if (this._getMessageId(domain, types, messageValue) !== messageId) {
      throw new HashMismatchError(`Message returned by the coordinator does not hash to the requested id: ${messageId}`)
    }

    const signature = await this._signTypedData({ domain, types, message: messageValue })

    await this._coordinator.confirmMessage(messageId, signature)

    const safeMessageResponse = await this._coordinator.getMessage(messageId)
    const threshold = await this.getThreshold()

    return {
      messageId,
      message: existingMessage.message,
      signature,
      confirmations: safeMessageResponse.confirmations?.length || 0,
      threshold,
      combinedSignature: safeMessageResponse.preparedSignature || null
    }
  }

  /**
   * Validates that the signer is an owner of the Safe.
   *
   * @returns {Promise<void>}
   * @throws {SignerError} If signer is not an owner
   */
  async validateSignerIsOwner () {
    const signerAddress = await this.getSignerAddress()
    const owners = await this.getOwners()

    const isOwner = owners.some(
      owner => owner.toLowerCase() === signerAddress.toLowerCase()
    )

    if (!isOwner) {
      const safeAddress = await this.getAddress()
      throw new SignerError(
        `Signer ${signerAddress} is not an owner of Safe ${safeAddress}. ` +
        `Current owners: ${owners.join(', ')}`
      )
    }
  }

  /**
   * Deploys the Safe.
   * Requires native ETH in the signer's EOA account to pay for gas.
   *
   * @returns {Promise<TransactionResult>} Deployment result with transaction hash and fee
   * @throws {Error} If Safe is already deployed
   * @throws {Error} If the owner account is not connected to a provider.
   */
  async deploy () {
    const isDeployed = await this.isDeployed()

    if (isDeployed) {
      throw new Error('Safe is already deployed')
    }

    const deploymentTx = this._buildDeploymentTransaction()

    const result = await this._signerAccount.sendTransaction(deploymentTx)

    this._resetState()

    return result
  }

  /**
   * Proposes a transaction for multisig approval.
   * Auto-executes if `autoExecute` is true and threshold is met after proposing.
   *
   * @param {EvmTransaction} tx - The transaction to propose
   * @param {MultisigTransactionOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Send and paymaster config options
   * @returns {Promise<MultisigProposal & MultisigInteractionResult>} The created proposal; its `status` is `'executed'` when `autoExecute` ran to completion, otherwise `'pending'`. When it auto-executed, `transaction` holds the on-chain result.
   */
  async propose (tx, options = {}) {
    const { autoExecute = false, ...config } = options

    return await this._submitTransaction(tx, config, autoExecute)
  }

  /**
   * Proposes transferring a token to another address for multisig approval.
   * Auto-executes if `autoExecute` is true and threshold is met after proposing.
   *
   * @param {TransferOptions} transferOptions - Transfer options
   * @param {MultisigTransactionOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Send and paymaster config options
   * @returns {Promise<MultisigProposal & MultisigInteractionResult>} The created proposal; its `status` is `'executed'` when `autoExecute` ran to completion, otherwise `'pending'`. When it auto-executed, `transaction` holds the on-chain result.
   * @throws {ValueError} If the estimated fee exceeds the configured `transferMaxFee`.
   */
  async proposeTransfer (transferOptions, options = {}) {
    const { autoExecute = false, ...config } = options
    const mergedConfig = { ...this._config, ...config }
    const tx = await WalletAccountEvm._getTransferTransaction(transferOptions)

    const { isSponsored, useNativeCoins, transferMaxFee } = mergedConfig
    if (!isSponsored && !useNativeCoins && transferMaxFee !== undefined) {
      const { fee } = await this.quoteSendTransaction(tx, config)
      if (fee > transferMaxFee) {
        throw new ValueError("The estimated fee exceeds the configured 'transferMaxFee' option.")
      }
    }

    return await this._submitTransaction(tx, config, autoExecute)
  }

  /**
   * Approves (signs) an existing proposal.
   *
   * @param {string} proposalId - The Safe operation hash to approve
   * @returns {Promise<MultisigProposal & MultisigInteractionResult>} Approval result
   * @throws {SignerError} If the signer is not an owner of the Safe.
   * @throws {NoSuchElementError} If no proposal exists for the given id.
   * @throws {HashMismatchError} If the proposal returned by the coordinator does not hash to the requested id.
   */
  async approveProposal (proposalId) {
    await this.validateSignerIsOwner()

    const threshold = await this.getThreshold()
    const safeOperationResponse = await this._coordinator.getProposal(proposalId)

    if (!safeOperationResponse) {
      throw new NoSuchElementError(`SafeOperation not found: ${proposalId}`)
    }

    const userOp = this._rebuildUserOperation(safeOperationResponse.userOperation)
    this._verifyProposalId(proposalId, userOp)

    const { domain, types, messageValue } = this._getProposalTypedData(userOp)
    const signature = await this._signTypedData({ domain, types, message: messageValue })

    await this._coordinator.confirmProposal(proposalId, signature)

    const updatedOperation = await this._coordinator.getProposal(proposalId)
    const confirmations = updatedOperation.confirmations?.length || 0

    return { proposalId, confirmations, threshold, status: 'pending' }
  }

  /**
   * Rejects a proposal by creating a rejection transaction.
   * A rejection is a zero-value transaction to the Safe itself with the same nonce.
   *
   * @param {string} proposalId - The Safe operation hash to reject
   * @returns {Promise<MultisigProposal>} The rejection proposal result
   * @throws {NoSuchElementError} If no proposal exists for the given id.
   * @throws {ValueError} If the original proposal has no nonce to reuse.
   */
  async rejectProposal (proposalId) {
    const safeOperationResponse = await this._coordinator.getProposal(proposalId)

    if (!safeOperationResponse) {
      throw new NoSuchElementError(`SafeOperation not found: ${proposalId}`)
    }

    const nonce = safeOperationResponse.userOperation?.nonce
    if (nonce === undefined) {
      throw new ValueError('Cannot reject: original proposal has no nonce')
    }

    const safeAddress = await this.getAddress()
    const rejectionTx = {
      to: safeAddress,
      value: '0',
      data: '0x'
    }

    return await this._propose(rejectionTx, { customNonce: BigInt(nonce) })
  }

  /**
   * Executes a fully signed Safe operation via the bundler. The returned fee is expressed in the asset the Safe pays
   * gas with: zero when sponsored, paymaster token units when paying with a token, wei otherwise.
   *
   * @param {string} proposalId - The Safe operation hash to execute
   * @returns {Promise<TransactionResult>} The execution result
   * @throws {NoSuchElementError} If no proposal exists for the given id.
   * @throws {ValueError} If the proposal does not have enough confirmations to meet the threshold.
   * @throws {HashMismatchError} If the proposal returned by the coordinator does not hash to the requested id.
   * @throws {AbstractionKitError} If the operation uses a paymaster whose data cannot be decoded and the account is
   *   not sponsored.
   */
  async executeProposal (proposalId) {
    return await this._executeProposal(proposalId, this._config)
  }

  /**
   * Proposes adding a new owner to the Safe.
   *
   * @param {string} ownerAddress - Address of new owner
   * @param {MultisigOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Options with optional threshold and paymaster config
   * @returns {Promise<MultisigProposal>} The proposal result
   */
  async addOwner (ownerAddress, options = {}) {
    const { threshold: newThreshold, ...config } = options

    const smartAccount = await this._getSmartAccount()
    const threshold = newThreshold || await this.getThreshold()

    const metaTransaction = smartAccount.createStandardAddOwnerWithThresholdMetaTransaction(getAddress(ownerAddress), threshold)

    return await this._propose(metaTransaction, config)
  }

  /**
   * Proposes removing an owner from the Safe.
   *
   * @param {string} ownerAddress - Address of owner to remove
   * @param {MultisigOptions & Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [options] - Options with optional threshold and paymaster config
   * @returns {Promise<MultisigProposal>} The proposal result
   */
  async removeOwner (ownerAddress, options = {}) {
    const { threshold: newThreshold, ...config } = options

    const smartAccount = await this._getSmartAccount()
    const currentThreshold = await this.getThreshold()

    const metaTransaction = await smartAccount.createRemoveOwnerMetaTransaction(
      this._provider,
      getAddress(ownerAddress),
      newThreshold || currentThreshold
    )

    return await this._propose([metaTransaction].flat(), config)
  }

  /**
   * Proposes swapping an owner with a new address.
   *
   * @param {string} oldOwnerAddress - Address of owner to remove
   * @param {string} newOwnerAddress - Address of new owner
   * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
   * @returns {Promise<MultisigProposal>} The proposal result
   */
  async swapOwner (oldOwnerAddress, newOwnerAddress, config) {
    const smartAccount = await this._getSmartAccount()

    const metaTransactions = await smartAccount.createSwapOwnerMetaTransactions(
      this._provider,
      getAddress(newOwnerAddress),
      getAddress(oldOwnerAddress)
    )

    return await this._propose([metaTransactions].flat(), config)
  }

  /**
   * Proposes changing the Safe threshold.
   *
   * @param {number} newThreshold - New threshold value
   * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
   * @returns {Promise<MultisigProposal>} The proposal result
   */
  async changeThreshold (newThreshold, config) {
    const smartAccount = await this._getSmartAccount()

    const metaTransaction = smartAccount.createChangeThresholdMetaTransaction(newThreshold)

    return await this._propose(metaTransaction, config)
  }

  /**
   * Proposes updating all owners and threshold in a batch.
   *
   * @param {string[]} newOwners - Array of new owner addresses
   * @param {number} newThreshold - New threshold value
   * @param {Partial<MultisigSafeWalletPaymasterTokenConfig | MultisigSafeWalletSponsoredConfig | MultisigSafeWalletNativeCoinsConfig>} [config] - If set, overrides the paymaster options defined in the wallet account configuration.
   * @returns {Promise<MultisigProposal>} The proposal result
   * @throws {ValueError} If there are no owner or threshold changes to make.
   */
  async updateOwners (newOwners, newThreshold, config) {
    const smartAccount = await this._getSmartAccount()
    const currentOwners = await this.getOwners()
    const currentThreshold = await this.getThreshold()

    const currentOwnersLower = currentOwners.map(o => o.toLowerCase())
    const newOwnersLower = newOwners.map(o => o.toLowerCase())

    const toAdd = newOwners.filter(o => !currentOwnersLower.includes(o.toLowerCase()))
    const toRemove = currentOwners.filter(o => !newOwnersLower.includes(o.toLowerCase()))

    const owners = currentOwners.map(o => getAddress(o))
    const removalThreshold = Math.max(1, Math.min(currentThreshold, newOwners.length))
    const transactions = []

    for (const owner of toAdd) {
      const added = getAddress(owner)
      transactions.push(smartAccount.createStandardAddOwnerWithThresholdMetaTransaction(added, currentThreshold))
      owners.unshift(added)
    }

    for (const owner of toRemove) {
      const removed = getAddress(owner)
      const index = owners.findIndex(o => o.toLowerCase() === removed.toLowerCase())
      const prevOwner = index <= 0 ? SENTINEL_OWNER : owners[index - 1]
      transactions.push(smartAccount.createStandardRemoveOwnerMetaTransaction(removed, removalThreshold, prevOwner))
      owners.splice(index, 1)
    }

    if (newThreshold !== currentThreshold) {
      transactions.push(smartAccount.createChangeThresholdMetaTransaction(newThreshold))
    }

    if (transactions.length === 0) {
      throw new ValueError('No changes to make - owners and threshold are the same')
    }

    return await this._propose(transactions, config)
  }

  /**
   * Returns a read-only copy of this account.
   *
   * @returns {Promise<WalletAccountReadOnlyMultisigSafe>} The read-only account
   */
  async toReadOnlyAccount () {
    const address = await this.getAddress()

    return new WalletAccountReadOnlyMultisigSafe({
      ...this._config,
      safeOptions: { safeAddress: address }
    })
  }

  /**
   * Disposes the wallet account, clearing sensitive data from memory. A caller-supplied owner account is left
   * untouched, since its lifecycle belongs to the caller.
   */
  dispose () {
    if (this._signerAccount && !this._isExternalSignerAccount) {
      this._signerAccount.dispose()
    }
    this._signerAccount = null
    this._paymasters.clear()
    this._bundler = undefined
    this._deployedSmartAccount = undefined
    this._coordinator = null
  }

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
   * @throws {SignerError} If the signer is not an owner of the Safe.
   */
  async _propose (transaction, config) {
    await this.validateSignerIsOwner()

    const threshold = await this.getThreshold()
    const chainId = this._config.chainId

    const { userOp, smartAccount } = await this._createSafeOperation(transaction, config)

    const signer = await this._buildSigner()
    userOp.signature = await smartAccount.signUserOperationWithSigners(userOp, [signer], chainId)

    const proposalId = this._getProposalId(userOp)

    await this._coordinator.submitProposal(proposalId, await this._buildProposalPayload(userOp))

    return {
      proposalId,
      confirmations: 1,
      threshold,
      status: 'pending'
    }
  }

  /** @private */
  async _submitTransaction (tx, config, autoExecute) {
    const proposal = await this._propose(tx, config)

    if (autoExecute && proposal.confirmations >= proposal.threshold) {
      const transaction = await this._executeProposal(proposal.proposalId, { ...this._config, ...config })
      return { ...proposal, status: 'executed', transaction }
    }

    return proposal
  }

  /** @private */
  async _executeProposal (proposalId, config) {
    const threshold = await this.getThreshold()
    const safeOperationResponse = await this._coordinator.getProposal(proposalId)

    if (!safeOperationResponse) {
      throw new NoSuchElementError(`SafeOperation not found: ${proposalId}`)
    }

    const confirmations = safeOperationResponse.confirmations?.length || 0

    if (confirmations < threshold) {
      throw new ValueError(
        `Not enough confirmations: ${confirmations}/${threshold}. ` +
        `Need ${threshold - confirmations} more signature(s).`
      )
    }

    const userOp = this._rebuildUserOperation(safeOperationResponse.userOperation)
    this._verifyProposalId(proposalId, userOp)

    userOp.signature = this._aggregateSignatures(safeOperationResponse)

    const fee = await this._getExecutionFee(userOp, config)
    const hash = await this._sendUserOperation(userOp)

    this._resetState()

    return {
      hash,
      fee
    }
  }

  /** @private */
  async _buildSigner () {
    return {
      address: await this._signerAccount.getAddress(),
      signTypedData: async (typedData) => this._signTypedData(typedData)
    }
  }

  /** @private */
  async _signTypedData (typedData) {
    return await this._signerAccount.signTypedData(typedData)
  }

  /** @private */
  _verifyProposalId (proposalId, userOp) {
    if (this._getProposalId(userOp) !== proposalId) {
      throw new HashMismatchError(`Proposal returned by the coordinator does not hash to the requested id: ${proposalId}`)
    }
  }

  /** @private */
  _getProposalId (userOp) {
    return SafeAccount020.getUserOperationEip712Hash(userOp, this._config.chainId, this._getSafeOperationOptions())
  }

  /** @private */
  _getProposalTypedData (userOp) {
    return SafeAccount020.getUserOperationEip712Data(userOp, this._config.chainId, this._getSafeOperationOptions())
  }

  /** @private */
  _getMessageId (domain, types, messageValue) {
    return TypedDataEncoder.hash(domain, types, messageValue)
  }

  /** @private */
  async _buildProposalPayload (userOp) {
    const { entrypointAddress, safe4337ModuleAddress } = this._getSafeOperationOptions()
    const safeAddress = await this.getAddress()

    return toJsonSafe({
      entryPoint: entrypointAddress,
      moduleAddress: safe4337ModuleAddress,
      safeAddress,
      userOperation: userOp,
      options: { validAfter: 0, validUntil: 0 }
    })
  }

  /** @private */
  _aggregateSignatures (safeOperationResponse) {
    if (safeOperationResponse.preparedSignature) {
      return safeOperationResponse.preparedSignature
    }

    const pairs = safeOperationResponse.confirmations.map(confirmation => ({
      signer: confirmation.owner,
      signature: confirmation.signature
    }))

    return SafeAccount020.formatSignaturesToUseroperationSignature(pairs, { validAfter: 0n, validUntil: 0n })
  }

  /** @private */
  async _sendUserOperation (userOp) {
    try {
      const { entrypointAddress } = this._getSafeOperationOptions()
      return await this._getBundler().sendUserOperation(userOp, entrypointAddress)
    } catch (error) {
      if (error instanceof AbstractionKitError && error.message.includes('AA50')) {
        throw new Error('Not enough funds in the Safe to repay the paymaster.')
      }
      throw error
    }
  }
}
