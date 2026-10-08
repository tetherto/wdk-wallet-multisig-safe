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

import { readFileSync } from 'node:fs'

import * as bip39 from 'bip39'

import { TypedDataEncoder } from 'ethers'

import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals'

import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

import {
  WalletAccountMultisigSafe,
  WalletAccountReadOnlyMultisigSafe
} from '../index.js'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const SEED = bip39.mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT = {
  index: 0,
  path: "m/44'/60'/0'/0/0",
  address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'
}

const ACCOUNT_2 = {
  address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
}

const MOCK_CONFIG = {
  provider: 'https://rpc.dummy-network.example/v3/dummy-key',
  bundlerUrl: 'https://bundler.dummy-network.example/rpc?apikey=dummy-key',
  chainId: 11155111n
}

const MOCK_SAFE_ADDRESS = '0x1234567890123456789012345678901234567890'
const MOCK_SAFE_OP_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const MOCK_USER_OP_HASH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
const MOCK_TX_HASH = '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
const MOCK_MESSAGE_HASH = '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678'
const MOCK_FEE = 350000000000000n
const VALID_SIGNATURE = '0x' + '11'.repeat(65)
const EIP1271_MAGIC_VALUE = '0x1626ba7e'

const MOCK_MESSAGE_EIP712 = {
  domain: { chainId: 11155111, verifyingContract: MOCK_SAFE_ADDRESS },
  types: { SafeMessage: [{ type: 'bytes', name: 'message' }] },
  messageValue: { message: '0x' + 'ab'.repeat(32) }
}
const EXPECTED_MESSAGE_HASH = TypedDataEncoder.hash(
  MOCK_MESSAGE_EIP712.domain,
  MOCK_MESSAGE_EIP712.types,
  MOCK_MESSAGE_EIP712.messageValue
)

const MOCK_SAFE_OP_TYPED_DATA = {
  domain: { chainId: 11155111, verifyingContract: MOCK_SAFE_ADDRESS },
  types: { SafeOp: [{ type: 'address', name: 'safe' }] },
  messageValue: { safe: MOCK_SAFE_ADDRESS }
}

const createMockSmartAccount = (overrides = {}) => ({
  getOwners: jest.fn().mockResolvedValue([ACCOUNT.address]),
  getThreshold: jest.fn().mockResolvedValue(1),
  signUserOperationWithSigners: jest.fn().mockResolvedValue('0xformattedsignature'),
  getSafeMessageEip712Data: jest.fn().mockReturnValue(MOCK_MESSAGE_EIP712),
  createStandardAddOwnerWithThresholdMetaTransaction: jest.fn().mockReturnValue({ to: MOCK_SAFE_ADDRESS, value: 0n, data: '0xaddowner' }),
  createRemoveOwnerMetaTransaction: jest.fn().mockResolvedValue({ to: MOCK_SAFE_ADDRESS, value: 0n, data: '0xremoveowner' }),
  createStandardRemoveOwnerMetaTransaction: jest.fn().mockReturnValue({ to: MOCK_SAFE_ADDRESS, value: 0n, data: '0xremoveowner' }),
  createSwapOwnerMetaTransactions: jest.fn().mockResolvedValue([{ to: MOCK_SAFE_ADDRESS, value: 0n, data: '0xswapowner' }]),
  createChangeThresholdMetaTransaction: jest.fn().mockReturnValue({ to: MOCK_SAFE_ADDRESS, value: 0n, data: '0xchangethreshold' }),
  ...overrides
})

const DUMMY_USER_OPERATION = {
  nonce: '0',
  initCode: '0x',
  callGasLimit: '100000',
  verificationGasLimit: '100000',
  preVerificationGas: '50000',
  maxFeePerGas: '1000000000',
  maxPriorityFeePerGas: '1000000000',
  paymasterAndData: '0x',
  paymasterVerificationGasLimit: '0',
  paymasterPostOpGasLimit: '0'
}

const createMockCoordinator = (overrides = {}) => ({
  submitProposal: jest.fn().mockResolvedValue(undefined),
  getProposal: jest.fn().mockResolvedValue({
    confirmations: [{ owner: ACCOUNT.address }],
    userOperation: DUMMY_USER_OPERATION,
    preparedSignature: '0xpreparedsignature'
  }),
  confirmProposal: jest.fn().mockResolvedValue(undefined),
  submitMessage: jest.fn().mockResolvedValue(undefined),
  confirmMessage: jest.fn().mockResolvedValue(undefined),
  getMessage: jest.fn().mockResolvedValue({
    messageHash: MOCK_MESSAGE_HASH,
    message: 'Hello!',
    confirmations: [{ owner: ACCOUNT.address }],
    preparedSignature: '0xmessagesignature'
  }),
  ...overrides
})

const createMockBundler = () => ({
  sendUserOperation: jest.fn().mockResolvedValue(MOCK_USER_OP_HASH)
})

describe('WalletAccountMultisigSafe', () => {
  let account

  beforeEach(() => {
    account = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
      ...MOCK_CONFIG,
      safeOptions: {
        owners: [ACCOUNT.address],
        threshold: 1
      }
    })
  })

  afterEach(() => {
    if (account) {
      account.dispose()
    }
  })

  describe('constructor', () => {
    test('should successfully initialize with seed phrase and path', async () => {
      expect(await account.getSignerAddress()).toBe(ACCOUNT.address)
    })

    test('should successfully initialize an account from an existing WalletAccountEvm', async () => {
      const ownerAccount = new WalletAccountEvm(SEED_PHRASE, "0'/0/0", { provider: MOCK_CONFIG.provider })
      const externalAccount = new WalletAccountMultisigSafe(ownerAccount, {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      expect(externalAccount.index).toBe(ACCOUNT.index)
      expect(externalAccount.path).toBe(ACCOUNT.path)
      expect(await externalAccount.getSignerAddress()).toBe(ACCOUNT.address)

      externalAccount.dispose()
      ownerAccount.dispose()
    })

    test('should successfully initialize an account from a WalletAccountEvm backed by a private key', async () => {
      const PRIVATE_KEY = '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727'

      const ownerAccount = WalletAccountEvm.fromPrivateKey(PRIVATE_KEY, { provider: MOCK_CONFIG.provider })
      const externalAccount = new WalletAccountMultisigSafe(ownerAccount, {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      expect(externalAccount.index).toBeUndefined()
      expect(externalAccount.path).toBeUndefined()
      expect(await externalAccount.getSignerAddress()).toBe(ACCOUNT.address)

      externalAccount.dispose()
      ownerAccount.dispose()
    })

    test('should accept an owner account that is not an instance of the WalletAccountEvm class resolved by this module', async () => {
      class DummyOwnerAccount {
        async getAddress () { return ACCOUNT_2.address }
      }

      const ownerAccount = new DummyOwnerAccount()
      const externalAccount = new WalletAccountMultisigSafe(ownerAccount, {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT_2.address],
          threshold: 1
        }
      })

      expect(await externalAccount.getSignerAddress()).toBe(ACCOUNT_2.address)

      externalAccount.dispose()
    })

    test('should successfully initialize with ERC-20 paymaster options', () => {
      const erc20Account = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=dummy-key',
        paymasterTokenAddress: '0x1234567890abcdef1234567890abcdef12345678',
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      expect(erc20Account._config.paymasterTokenAddress).toBe('0x1234567890abcdef1234567890abcdef12345678')
      expect(erc20Account._config.isSponsored).toBeUndefined()
      erc20Account.dispose()
    })

    test('should successfully initialize with sponsored paymaster and sponsorshipPolicyId', () => {
      const sponsoredAccount = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=sponsor-key',
        isSponsored: true,
        sponsorshipPolicyId: 'sp_my_policy_123',
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      expect(sponsoredAccount._config.isSponsored).toBe(true)
      expect(sponsoredAccount._config.sponsorshipPolicyId).toBe('sp_my_policy_123')
      sponsoredAccount.dispose()
    })

    test('should successfully initialize with ExistingSafeOptions', () => {
      const existingAccount = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      expect(existingAccount._safeAddress).toBe(MOCK_SAFE_ADDRESS)
      existingAccount.dispose()
    })

    test('should successfully initialize with PredictedSafeOptions including saltNonce', () => {
      const predictedAccount = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1,
          saltNonce: '0x1234'
        }
      })

      expect(predictedAccount._config.safeOptions.saltNonce).toBe('0x1234')
      predictedAccount.dispose()
    })
  })

  describe('index', () => {
    test('should return the correct index from path', () => {
      expect(account.index).toBe(ACCOUNT.index)
    })
  })

  describe('path', () => {
    test('should return the full derivation path', () => {
      expect(account.path).toBe(ACCOUNT.path)
    })
  })

  describe('keyPair', () => {
    test('should return deterministic key pair with privateKey and publicKey', () => {
      const keyPair = account.keyPair

      expect(keyPair).toBeDefined()
      expect(Buffer.from(keyPair.privateKey).toString('hex')).toBe('1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727')
      expect(Buffer.from(keyPair.publicKey).toString('hex')).toBe('0237b0bb7a8288d38ed49a524b5dc98cff3eb5ca824c9f9dc0dfdb3d9cd600f299')
    })
  })

  describe('getSignerAddress', () => {
    test('should return the correct EOA address', async () => {
      const address = await account.getSignerAddress()

      expect(address).toBe(ACCOUNT.address)
    })
  })

  describe('sign', () => {
    test('should return signature string', async () => {
      account._getSmartAccount = jest.fn().mockResolvedValue(createMockSmartAccount())
      account._signTypedData = jest.fn().mockResolvedValue('0xmocksignature')
      account._coordinator = createMockCoordinator()
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const result = await account.sign('Hello!')

      expect(result).toBe('0xmocksignature')
    })
  })

  describe('verify', () => {
    test('should return true for valid signature', async () => {
      account._provider = { request: jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE + '0'.repeat(56)) }
      account._safeAddress = MOCK_SAFE_ADDRESS

      const result = await account.verify('Hello!', VALID_SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for invalid signature', async () => {
      account._provider = { request: jest.fn().mockResolvedValue('0x' + '0'.repeat(64)) }
      account._safeAddress = MOCK_SAFE_ADDRESS

      const result = await account.verify('Hello!', VALID_SIGNATURE)

      expect(result).toBe(false)
    })
  })

  describe('proposeMessage', () => {
    test('should propose new message and return MessageProposal', async () => {
      const mockCoordinator = createMockCoordinator({
        getMessage: jest.fn().mockResolvedValue({
          messageHash: EXPECTED_MESSAGE_HASH,
          message: 'Hello!',
          confirmations: [{ owner: ACCOUNT.address }],
          preparedSignature: null
        })
      })
      account._getSmartAccount = jest.fn().mockResolvedValue(createMockSmartAccount())
      account._signTypedData = jest.fn().mockResolvedValue('0xmocksignature')
      account._coordinator = mockCoordinator
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const result = await account.proposeMessage('Hello!')

      expect(result.messageId).toBe(EXPECTED_MESSAGE_HASH)
      expect(result.message).toBe('Hello!')
      expect(result.signature).toBe('0xmocksignature')
      expect(result.confirmations).toBe(1)
      expect(result.threshold).toBe(1)
      expect(result.combinedSignature).toBeNull()
      expect(mockCoordinator.submitMessage).toHaveBeenCalledWith(
        MOCK_SAFE_ADDRESS,
        EXPECTED_MESSAGE_HASH,
        { message: 'Hello!', signature: '0xmocksignature' }
      )
    })
  })

  describe('approveMessageProposal', () => {
    test('should approve existing message and return MessageProposal', async () => {
      const mockCoordinator = createMockCoordinator({
        getMessage: jest.fn()
          .mockResolvedValueOnce({
            message: 'Hello!',
            confirmations: [{ owner: ACCOUNT.address }],
            preparedSignature: null
          })
          .mockResolvedValueOnce({
            messageHash: EXPECTED_MESSAGE_HASH,
            message: 'Hello!',
            confirmations: [{ owner: ACCOUNT.address }, { owner: ACCOUNT_2.address }],
            preparedSignature: '0xcombinedsig'
          })
      })
      account._getSmartAccount = jest.fn().mockResolvedValue(createMockSmartAccount())
      account._signTypedData = jest.fn().mockResolvedValue('0xmocksignature')
      account._coordinator = mockCoordinator
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 2
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const result = await account.approveMessageProposal(EXPECTED_MESSAGE_HASH)

      expect(result.messageId).toBe(EXPECTED_MESSAGE_HASH)
      expect(result.message).toBe('Hello!')
      expect(result.signature).toBe('0xmocksignature')
      expect(result.confirmations).toBe(2)
      expect(result.threshold).toBe(2)
      expect(result.combinedSignature).toBe('0xcombinedsig')
      expect(mockCoordinator.confirmMessage).toHaveBeenCalledWith(
        EXPECTED_MESSAGE_HASH,
        '0xmocksignature'
      )
    })

    test('should throw and not sign or confirm when the returned message does not hash to the requested id', async () => {
      const mockCoordinator = createMockCoordinator()
      account._getSmartAccount = jest.fn().mockResolvedValue(createMockSmartAccount())
      account._signTypedData = jest.fn().mockResolvedValue('0xmocksignature')
      account._coordinator = mockCoordinator
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 2
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      await expect(account.approveMessageProposal(MOCK_MESSAGE_HASH))
        .rejects.toThrow(`Message returned by the coordinator does not hash to the requested id: ${MOCK_MESSAGE_HASH}`)
      expect(account._signTypedData).not.toHaveBeenCalled()
      expect(mockCoordinator.confirmMessage).not.toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    test('should clear sensitive data', () => {
      const testAccount = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      testAccount.dispose()

      expect(testAccount._signerAccount).toBe(null)
      expect(testAccount._coordinator).toBe(null)
    })

    test('should not dispose a caller-supplied wallet-evm account', async () => {
      const EXPECTED_SIGNATURE = '0x873e1cfa87ff824e5760b0018e2e882dda861d3ab6f16764f36dbe5016b7bc7a78e0531be068a8614fb74d8e65ad43d0a12acbdcf89858c52fb3df3d5ffa5e1d1c'

      const ownerAccount = new WalletAccountEvm(SEED_PHRASE, "0'/0/0", { provider: MOCK_CONFIG.provider })
      const testAccount = new WalletAccountMultisigSafe(ownerAccount, {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      testAccount.dispose()

      expect(await ownerAccount.sign('Hello world!')).toBe(EXPECTED_SIGNATURE)

      ownerAccount.dispose()
    })

    test('should be safe to call dispose twice on an account built from a WalletAccountEvm', () => {
      const ownerAccount = new WalletAccountEvm(SEED_PHRASE, "0'/0/0", { provider: MOCK_CONFIG.provider })
      const testAccount = new WalletAccountMultisigSafe(ownerAccount, {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      testAccount.dispose()

      expect(() => testAccount.dispose()).not.toThrow()

      ownerAccount.dispose()
    })

    test('should be safe to call dispose twice', () => {
      const testAccount = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      testAccount.dispose()

      expect(() => testAccount.dispose()).not.toThrow()
    })
  })

  describe('toReadOnlyAccount', () => {
    test('should return a WalletAccountReadOnlyMultisigSafe instance', async () => {
      account._safeAddress = MOCK_SAFE_ADDRESS

      const readOnlyAccount = await account.toReadOnlyAccount()

      expect(readOnlyAccount).toBeInstanceOf(WalletAccountReadOnlyMultisigSafe)
      expect(readOnlyAccount._config.provider).toBe(MOCK_CONFIG.provider)
      expect(readOnlyAccount._config.chainId).toBe(MOCK_CONFIG.chainId)
      expect(readOnlyAccount._config.safeOptions.safeAddress).toBe(MOCK_SAFE_ADDRESS)
    })
  })

  describe('approveProposal', () => {
    test('should return approval result with confirmations', async () => {
      const mockCoordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }, { owner: ACCOUNT_2.address }],
          userOperation: { nonce: '0' },
          preparedSignature: '0xsignature'
        })
      })
      account._coordinator = mockCoordinator
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._getProposalTypedData = jest.fn().mockReturnValue(MOCK_SAFE_OP_TYPED_DATA)
      account._signTypedData = jest.fn().mockResolvedValue('0xrawsig')
      account._threshold = 2
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const result = await account.approveProposal(MOCK_SAFE_OP_HASH)

      expect(result.confirmations).toBe(2)
    })

    test('should call confirmProposal on coordinator', async () => {
      const mockCoordinator = createMockCoordinator()
      account._coordinator = mockCoordinator
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._getProposalTypedData = jest.fn().mockReturnValue(MOCK_SAFE_OP_TYPED_DATA)
      account._signTypedData = jest.fn().mockResolvedValue('0xrawsig')
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      await account.approveProposal(MOCK_SAFE_OP_HASH)

      expect(mockCoordinator.confirmProposal).toHaveBeenCalledWith(MOCK_SAFE_OP_HASH, '0xrawsig')
    })

    test('should throw and not sign or confirm when the returned proposal does not hash to the requested id', async () => {
      const mockCoordinator = createMockCoordinator()
      account._coordinator = mockCoordinator
      account._getProposalId = jest.fn().mockReturnValue(MOCK_USER_OP_HASH)
      account._getProposalTypedData = jest.fn().mockReturnValue(MOCK_SAFE_OP_TYPED_DATA)
      account._signTypedData = jest.fn().mockResolvedValue('0xrawsig')
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      await expect(account.approveProposal(MOCK_SAFE_OP_HASH))
        .rejects.toThrow(`Proposal returned by the coordinator does not hash to the requested id: ${MOCK_SAFE_OP_HASH}`)
      expect(account._signTypedData).not.toHaveBeenCalled()
      expect(mockCoordinator.confirmProposal).not.toHaveBeenCalled()
    })
  })

  describe('rejectProposal', () => {
    test('should return rejection result with proposalId', async () => {
      const mockCoordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }],
          userOperation: { nonce: '5' },
          preparedSignature: '0xsignature'
        })
      })
      account._coordinator = mockCoordinator
      account._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const result = await account.rejectProposal(MOCK_SAFE_OP_HASH)

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(result.confirmations).toBe(1)
      expect(result.threshold).toBe(1)
    })

    test('should pass customNonce from original proposal', async () => {
      const mockCoordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }],
          userOperation: { nonce: '42' },
          preparedSignature: '0xsignature'
        })
      })
      account._coordinator = mockCoordinator
      account._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      await account.rejectProposal(MOCK_SAFE_OP_HASH)

      expect(account._createSafeOperation).toHaveBeenCalledWith(
        expect.objectContaining({ to: MOCK_SAFE_ADDRESS, value: '0', data: '0x' }),
        { customNonce: 42n }
      )
    })

    test('should throw if proposal not found', async () => {
      account._coordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue(null)
      })
      account._safeAddress = MOCK_SAFE_ADDRESS

      await expect(account.rejectProposal(MOCK_SAFE_OP_HASH))
        .rejects.toThrow(`SafeOperation not found: ${MOCK_SAFE_OP_HASH}`)
    })

    test('should throw if original proposal has no nonce', async () => {
      account._coordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }],
          userOperation: {}
        })
      })
      account._safeAddress = MOCK_SAFE_ADDRESS

      await expect(account.rejectProposal(MOCK_SAFE_OP_HASH))
        .rejects.toThrow('Cannot reject: original proposal has no nonce')
    })
  })

  describe('executeProposal', () => {
    test('should return the execution hash and the fee in wei when the Safe pays with native coins', async () => {
      const EXPECTED_FEE = 250000000000000n

      account._coordinator = createMockCoordinator()
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._getBundler = jest.fn().mockReturnValue(createMockBundler())
      account._threshold = 1

      const result = await account.executeProposal(MOCK_SAFE_OP_HASH)

      expect(result).toEqual({ hash: MOCK_USER_OP_HASH, fee: EXPECTED_FEE })
    })

    describe('when the Safe pays gas with a paymaster token', () => {
      const PAYMASTER_URL = 'https://api.candide.dev/paymaster/v3/sepolia/dummy-key'
      const PAYMASTER_TOKEN_ADDRESS = '0xd077A400968890Eacc75cdc901F0356c943e4fDb'
      const DUMMY_TOKEN_USER_OPERATION = JSON.parse(readFileSync(new URL('./fixtures/candide-token-sepolia.json', import.meta.url), 'utf8')).userOperation
      const DUMMY_GET_TOKENS_RESULT = '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000d077a400968890eacc75cdc901f0356c943e4fdb000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005afd67f2dc0e1b2e0000000000000000000000000000000000000000000000000000000000000000000000'

      let erc20Account

      beforeEach(() => {
        erc20Account = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
          ...MOCK_CONFIG,
          paymasterUrl: PAYMASTER_URL,
          paymasterTokenAddress: PAYMASTER_TOKEN_ADDRESS,
          safeOptions: { owners: [ACCOUNT.address], threshold: 1 }
        })
      })

      afterEach(() => {
        erc20Account.dispose()
      })

      test('should return the token maximum signed into the operation', async () => {
        const EXPECTED_FEE = 2764597n

        erc20Account._coordinator = createMockCoordinator({
          getProposal: jest.fn().mockResolvedValue({
            confirmations: [{ owner: ACCOUNT.address }],
            userOperation: DUMMY_TOKEN_USER_OPERATION,
            preparedSignature: '0xpreparedsignature'
          })
        })
        erc20Account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
        erc20Account._getBundler = jest.fn().mockReturnValue(createMockBundler())
        erc20Account._provider = { request: jest.fn().mockResolvedValue(DUMMY_GET_TOKENS_RESULT) }
        erc20Account._threshold = 1

        const result = await erc20Account.executeProposal(MOCK_SAFE_OP_HASH)

        expect(result).toEqual({ hash: MOCK_USER_OP_HASH, fee: EXPECTED_FEE })
      })
    })

    test('should call sendUserOperation on the bundler', async () => {
      const mockBundler = createMockBundler()
      account._coordinator = createMockCoordinator()
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._getBundler = jest.fn().mockReturnValue(mockBundler)
      account._threshold = 1

      await account.executeProposal(MOCK_SAFE_OP_HASH)

      expect(mockBundler.sendUserOperation).toHaveBeenCalled()
    })

    test('should throw if not enough confirmations', async () => {
      account._coordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }],
          userOperation: { nonce: '0' }
        })
      })
      account._threshold = 2

      await expect(account.executeProposal(MOCK_SAFE_OP_HASH))
        .rejects.toThrow('Not enough confirmations')
    })

    test('should throw and not broadcast when the returned proposal does not hash to the requested id', async () => {
      const mockBundler = createMockBundler()
      account._coordinator = createMockCoordinator()
      account._getBundler = jest.fn().mockReturnValue(mockBundler)
      account._getProposalId = jest.fn().mockReturnValue(MOCK_USER_OP_HASH)
      account._threshold = 1

      await expect(account.executeProposal(MOCK_SAFE_OP_HASH))
        .rejects.toThrow(`Proposal returned by the coordinator does not hash to the requested id: ${MOCK_SAFE_OP_HASH}`)
      expect(mockBundler.sendUserOperation).not.toHaveBeenCalled()
    })
  })

  describe('deploy', () => {
    test('should return hash and fee on successful deployment', async () => {
      const sendTransaction = jest.fn().mockResolvedValue({ hash: MOCK_TX_HASH, fee: 210000n })
      account.isDeployed = jest.fn().mockResolvedValue(false)
      account._buildDeploymentTransaction = jest.fn().mockReturnValue({
        to: '0xDeployFactory',
        value: 0n,
        data: '0xdeploydata'
      })
      account._signerAccount = {
        ...account._signerAccount,
        sendTransaction,
        dispose: jest.fn()
      }

      const result = await account.deploy()

      expect(result.hash).toBe(MOCK_TX_HASH)
      expect(result.fee).toBe(210000n)
      expect(sendTransaction).toHaveBeenCalledWith({
        to: '0xDeployFactory',
        value: 0n,
        data: '0xdeploydata'
      })
    })

    test('should throw if the owner account is not connected to a provider', async () => {
      const ownerAccount = new WalletAccountEvm(SEED_PHRASE, "0'/0/0")
      const externalAccount = new WalletAccountMultisigSafe(ownerAccount, {
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })
      externalAccount.isDeployed = jest.fn().mockResolvedValue(false)

      await expect(externalAccount.deploy())
        .rejects.toThrow('The wallet must be connected to a provider to send transactions.')

      externalAccount.dispose()
      ownerAccount.dispose()
    })

    test('should throw if Safe is already deployed', async () => {
      account.isDeployed = jest.fn().mockResolvedValue(true)

      await expect(account.deploy())
        .rejects.toThrow('Safe is already deployed')
    })
  })

  describe('propose', () => {
    test('should return MultisigTransactionResult and auto-execute when threshold met', async () => {
      account.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: MOCK_FEE })
      account._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._coordinator = createMockCoordinator()
      account._getBundler = jest.fn().mockReturnValue(createMockBundler())
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const tx = { to: ACCOUNT_2.address, value: '1000', data: '0x' }
      const result = await account.propose(tx, { autoExecute: true })

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(result.confirmations).toBe(1)
      expect(result.threshold).toBe(1)
      expect(result.status).toBe('executed')
      expect(result.transaction.hash).toBe(MOCK_USER_OP_HASH)
    })

    test('should price the auto-executed operation with the paymaster override passed to propose', async () => {
      account.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: MOCK_FEE })
      account._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._coordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }],
          userOperation: { ...DUMMY_USER_OPERATION, paymasterAndData: '0x' + 'ab'.repeat(40) },
          preparedSignature: '0xpreparedsignature'
        })
      })
      account._getBundler = jest.fn().mockReturnValue(createMockBundler())
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const tx = { to: ACCOUNT_2.address, value: '1000', data: '0x' }
      const result = await account.propose(tx, { autoExecute: true, paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=sponsor-key', isSponsored: true })

      expect(result.status).toBe('executed')
      expect(result.transaction).toEqual({ hash: MOCK_USER_OP_HASH, fee: 0n })
    })

    test('should not auto-execute when threshold not met', async () => {
      account.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: MOCK_FEE })
      account._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._coordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }],
          userOperation: { nonce: '0' },
          preparedSignature: '0xsignature'
        })
      })
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 2
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const tx = { to: ACCOUNT_2.address, value: '1000', data: '0x' }
      const result = await account.propose(tx)

      expect(result.status).toBe('pending')
      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
    })

    test('should quote a zero fee in sponsored mode', async () => {
      const sponsoredAccount = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=sponsor-key',
        isSponsored: true,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })
      sponsoredAccount._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      sponsoredAccount._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      sponsoredAccount._coordinator = createMockCoordinator()
      sponsoredAccount._getBundler = jest.fn().mockReturnValue(createMockBundler())
      sponsoredAccount._safeAddress = MOCK_SAFE_ADDRESS
      sponsoredAccount._threshold = 1
      sponsoredAccount.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const tx = { to: ACCOUNT_2.address, value: '1000', data: '0x' }
      const { fee } = await sponsoredAccount.quoteSendTransaction(tx)

      expect(fee).toBe(0n)

      sponsoredAccount.dispose()
    })
  })

  describe('proposeTransfer', () => {
    test('should return MultisigTransactionResult', async () => {
      account.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: MOCK_FEE })
      account._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._coordinator = createMockCoordinator()
      account._getBundler = jest.fn().mockReturnValue(createMockBundler())
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const transferOptions = {
        token: '0x956962C34687A954e611A83619ABaA37Ce6bC78A',
        recipient: ACCOUNT_2.address,
        amount: 1000n
      }
      const result = await account.proposeTransfer(transferOptions, { autoExecute: true })

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(result.status).toBe('executed')
    })

    test('should throw when the fee exceeds transferMaxFee', async () => {
      const erc20Account = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=dummy-key',
        paymasterTokenAddress: '0x1234567890abcdef1234567890abcdef12345678',
        transferMaxFee: 1n,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })
      erc20Account.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: MOCK_FEE })
      erc20Account._safeAddress = MOCK_SAFE_ADDRESS
      erc20Account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      const transferOptions = {
        token: '0x956962C34687A954e611A83619ABaA37Ce6bC78A',
        recipient: ACCOUNT_2.address,
        amount: 1000n
      }

      await expect(erc20Account.proposeTransfer(transferOptions))
        .rejects.toThrow("The estimated fee exceeds the configured 'transferMaxFee' option.")

      erc20Account.dispose()
    })

    test('should not throw when the fee equals transferMaxFee', async () => {
      const erc20Account = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=dummy-key',
        paymasterTokenAddress: '0x1234567890abcdef1234567890abcdef12345678',
        transferMaxFee: MOCK_FEE,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })
      erc20Account.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: MOCK_FEE })
      erc20Account._submitTransaction = jest.fn().mockResolvedValue({ proposalId: MOCK_SAFE_OP_HASH, confirmations: 1, threshold: 1, status: 'pending' })
      erc20Account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)
      erc20Account._safeAddress = MOCK_SAFE_ADDRESS

      const result = await erc20Account.proposeTransfer({
        token: '0x956962C34687A954e611A83619ABaA37Ce6bC78A',
        recipient: ACCOUNT_2.address,
        amount: 1000n
      })

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      erc20Account.dispose()
    })
  })

  describe('Owner Management', () => {
    let mockSmartAccount

    beforeEach(() => {
      mockSmartAccount = createMockSmartAccount()
      account._getSmartAccount = jest.fn().mockResolvedValue(mockSmartAccount)
      account._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: mockSmartAccount, chainId: 11155111n })
      account._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      account._coordinator = createMockCoordinator()
      account._safeAddress = MOCK_SAFE_ADDRESS
      account._threshold = 1
      account.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)
    })

    test('addOwner should return propose result', async () => {
      const result = await account.addOwner(ACCOUNT_2.address)

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(mockSmartAccount.createStandardAddOwnerWithThresholdMetaTransaction).toHaveBeenCalledWith(ACCOUNT_2.address, 1)
    })

    test('addOwner checksums a lowercased owner address before building the meta-transaction', async () => {
      await account.addOwner(ACCOUNT_2.address.toLowerCase())

      expect(mockSmartAccount.createStandardAddOwnerWithThresholdMetaTransaction).toHaveBeenCalledWith(ACCOUNT_2.address, 1)
    })

    test('removeOwner should return propose result', async () => {
      const result = await account.removeOwner(ACCOUNT_2.address)

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(mockSmartAccount.createRemoveOwnerMetaTransaction).toHaveBeenCalled()
    })

    test('swapOwner should return propose result', async () => {
      const result = await account.swapOwner(ACCOUNT.address, ACCOUNT_2.address)

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(mockSmartAccount.createSwapOwnerMetaTransactions).toHaveBeenCalled()
    })

    test('changeThreshold should return propose result', async () => {
      const result = await account.changeThreshold(1)

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(mockSmartAccount.createChangeThresholdMetaTransaction).toHaveBeenCalledWith(1)
    })

    test('updateOwners removing the head after an add uses the added owner as prevOwner, not the sentinel', async () => {
      const THIRD_OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      const NEW_OWNER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
      account._owners = [ACCOUNT.address, ACCOUNT_2.address, THIRD_OWNER]

      const result = await account.updateOwners([NEW_OWNER, ACCOUNT_2.address, THIRD_OWNER], 1)

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(mockSmartAccount.createStandardAddOwnerWithThresholdMetaTransaction).toHaveBeenCalledWith(NEW_OWNER, 1)
      expect(mockSmartAccount.createStandardRemoveOwnerMetaTransaction).toHaveBeenCalledWith(ACCOUNT.address, 1, NEW_OWNER)
    })

    test('updateOwners recomputes prevOwner across sequential removals so the second targets the surviving predecessor', async () => {
      const THIRD_OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      account._owners = [ACCOUNT.address, ACCOUNT_2.address, THIRD_OWNER]

      await account.updateOwners([ACCOUNT.address], 1)

      expect(mockSmartAccount.createStandardRemoveOwnerMetaTransaction).toHaveBeenNthCalledWith(1, ACCOUNT_2.address, 1, ACCOUNT.address)
      expect(mockSmartAccount.createStandardRemoveOwnerMetaTransaction).toHaveBeenNthCalledWith(2, THIRD_OWNER, 1, ACCOUNT.address)
    })
  })

  describe('custom coordinator injection', () => {
    const createCustomAccount = (coordinator) => {
      const customAccount = new WalletAccountMultisigSafe(SEED_PHRASE, "0'/0/0", {
        ...MOCK_CONFIG,
        coordinator,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      customAccount.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: MOCK_FEE })
      customAccount._createSafeOperation = jest.fn().mockResolvedValue({ userOp: {}, smartAccount: createMockSmartAccount(), chainId: 11155111n })
      customAccount._getProposalId = jest.fn().mockReturnValue(MOCK_SAFE_OP_HASH)
      customAccount._getProposalTypedData = jest.fn().mockReturnValue(MOCK_SAFE_OP_TYPED_DATA)
      customAccount._signTypedData = jest.fn().mockResolvedValue('0xrawsig')
      customAccount._getBundler = jest.fn().mockReturnValue(createMockBundler())
      customAccount._safeAddress = MOCK_SAFE_ADDRESS
      customAccount._threshold = 1
      customAccount.validateSignerIsOwner = jest.fn().mockResolvedValue(undefined)

      return customAccount
    }

    test('propose shares the proposal through the injected coordinator', async () => {
      const customCoordinator = createMockCoordinator()
      const customAccount = createCustomAccount(customCoordinator)

      const result = await customAccount.propose({ to: ACCOUNT_2.address, value: '1000', data: '0x' })

      expect(result.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(result.confirmations).toBe(1)
      expect(customCoordinator.submitProposal).toHaveBeenCalledWith(MOCK_SAFE_OP_HASH, expect.anything())

      customAccount.dispose()
    })

    test('approveProposal confirms through the injected coordinator', async () => {
      const customCoordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }, { owner: ACCOUNT_2.address }],
          userOperation: { nonce: '0' },
          preparedSignature: '0xpreparedsignature'
        })
      })
      const customAccount = createCustomAccount(customCoordinator)

      await customAccount.approveProposal(MOCK_SAFE_OP_HASH)

      expect(customCoordinator.confirmProposal).toHaveBeenCalledWith(MOCK_SAFE_OP_HASH, '0xrawsig')

      customAccount.dispose()
    })
  })
})
