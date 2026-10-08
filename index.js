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

// ============================================
// Re-export types from @tetherto/wdk-wallet
// ============================================
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInfo} MultisigInfo */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigTransactionOptions} MultisigTransactionOptions */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInteractionResult} MultisigInteractionResult */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigSignature} MultisigSignature */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigOptions} MultisigOptions */

// ============================================
// Re-export types from @tetherto/wdk-wallet-evm
// ============================================

/** @typedef {import('@tetherto/wdk-wallet-evm').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet-evm').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransactionReceipt} EvmTransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').ApproveOptions} ApproveOptions */

// ============================================
// Re-export Safe option and receipt types
// ============================================

/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').ExistingSafeOptions} ExistingSafeOptions */
/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').PredictedSafeOptions} PredictedSafeOptions */
/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').UserOperationReceipt} UserOperationReceipt */
/** @typedef {import('./src/wallet-account-multisig-safe.js').MultisigSafeOwnerAccount} MultisigSafeOwnerAccount */

// ============================================
// Re-export types from read-only module
// ============================================

/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').MultisigSafeWalletCommonConfig} MultisigSafeWalletCommonConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').MultisigSafeWalletPaymasterTokenConfig} MultisigSafeWalletPaymasterTokenConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').MultisigSafeWalletSponsoredConfig} MultisigSafeWalletSponsoredConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').MultisigSafeWalletNativeCoinsConfig} MultisigSafeWalletNativeCoinsConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').MultisigSafeWalletConfig} MultisigSafeWalletConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-safe.js').MultisigSafeWalletReadOnlyConfig} MultisigSafeWalletReadOnlyConfig */

// ============================================
// Re-export types from coordinators
// ============================================

/** @typedef {import('./src/coordinators/index.js').MultisigCoordinatorProposal} MultisigCoordinatorProposal */
/** @typedef {import('./src/coordinators/index.js').MultisigCoordinatorMessage} MultisigCoordinatorMessage */
/** @typedef {import('./src/coordinators/index.js').MultisigCoordinatorMessageInput} MultisigCoordinatorMessageInput */
/** @typedef {import('./src/coordinators/index.js').SafeTxServiceCoordinatorConfig} SafeTxServiceCoordinatorConfig */

// ============================================
// Export classes and constants
// ============================================

export { default } from './src/wallet-manager-multisig-safe.js'

export { default as WalletAccountReadOnlyMultisigSafe, DEFAULT_SAFE_MODULES_VERSION, DEFAULT_SAFE_VERSION } from './src/wallet-account-read-only-multisig-safe.js'

export { default as WalletAccountMultisigSafe } from './src/wallet-account-multisig-safe.js'

// ============================================
// Export coordinators
// ============================================

export { IMultisigCoordinator, SafeTxServiceCoordinator, toJsonSafe } from './src/coordinators/index.js'

// ============================================
// Export errors
// ============================================

export { ConfigurationError, HashMismatchError } from './src/errors.js'
