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

import { describe, expect, test, jest } from '@jest/globals'

import { AbiCoder } from 'ethers'

import { InvalidTokenError } from '@tetherto/wdk-wallet'

import { WalletAccountReadOnlyMultisigSafe, SafeTxServiceCoordinator } from '../index.js'

const ACCOUNT = {
  address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'
}

const ACCOUNT_2 = {
  address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
}

class DummyCoordinator {
  async submitProposal () {}
  async getProposal () { return null }
  async confirmProposal () {}
  async submitMessage () {}
  async getMessage () { return null }
  async confirmMessage () {}
}

const MOCK_CONFIG = {
  provider: 'https://rpc.dummy-network.example/v3/dummy-key',
  bundlerUrl: 'https://bundler.dummy-network.example/rpc?apikey=dummy-key',
  chainId: 11155111n
}

const MOCK_SAFE_ADDRESS = '0x1234567890123456789012345678901234567890'
const MOCK_SAFE_OP_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const MOCK_MESSAGE_HASH = '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678'
const PREDICTED_SAFE_ADDRESS = '0x2298cce24D20586409b765A86B44f535982395b2'
const EIP1271_MAGIC_VALUE = '0x1626ba7e'
const VALID_SIGNATURE = '0x' + '11'.repeat(65)

const createMockSmartAccount = (overrides = {}) => ({
  getOwners: jest.fn().mockResolvedValue([ACCOUNT.address]),
  getThreshold: jest.fn().mockResolvedValue(1),
  ...overrides
})

const createMockCoordinator = (overrides = {}) => ({
  submitProposal: jest.fn().mockResolvedValue(undefined),
  getProposal: jest.fn().mockResolvedValue({
    confirmations: [{ owner: ACCOUNT.address }],
    preparedSignature: '0xsignature'
  }),
  confirmProposal: jest.fn().mockResolvedValue(undefined),
  submitMessage: jest.fn().mockResolvedValue(undefined),
  getMessage: jest.fn().mockResolvedValue({
    confirmations: [{ owner: ACCOUNT.address }],
    preparedSignature: '0xmessagesignature'
  }),
  confirmMessage: jest.fn().mockResolvedValue(undefined),
  ...overrides
})

describe('WalletAccountReadOnlyMultisigSafe', () => {
  describe('constructor', () => {
    test('should successfully initialize with safeAddress', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      expect(account).toBeDefined()
      expect(account._safeAddress).toBe(MOCK_SAFE_ADDRESS)
    })

    test('should successfully initialize with PredictedSafeOptions', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address, ACCOUNT_2.address],
          threshold: 2
        }
      })

      expect(account).toBeDefined()
      expect(account._safeAddress).toBe(null)
    })

    test('should store config correctly', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      expect(account._config.provider).toBe(MOCK_CONFIG.provider)
      expect(account._config.bundlerUrl).toBe(MOCK_CONFIG.bundlerUrl)
      expect(account._config.chainId).toBe(MOCK_CONFIG.chainId)
    })

    test('should default to the hosted SafeTxServiceCoordinator when no coordinator is provided', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })

      expect(account._coordinator).toBeInstanceOf(SafeTxServiceCoordinator)
    })

    test('should use the provided coordinator when given', () => {
      const coordinator = new DummyCoordinator()
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        coordinator,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })

      expect(account._coordinator).toBe(coordinator)
    })

    test('should throw if options is missing', () => {
      expect(() => {
        new WalletAccountReadOnlyMultisigSafe(MOCK_CONFIG)
      }).toThrow('safeOptions is required')
    })

    test('should throw when safeOptions has neither safeAddress nor owners', () => {
      expect(() => {
        new WalletAccountReadOnlyMultisigSafe({
          ...MOCK_CONFIG,
          safeOptions: {}
        })
      }).toThrow("safeOptions must provide either 'safeAddress' (existing Safe) or 'owners' (predicted Safe).")
    })

    test('should throw if owners is not an array', () => {
      expect(() => {
        new WalletAccountReadOnlyMultisigSafe({
          ...MOCK_CONFIG,
          safeOptions: {
            owners: ACCOUNT.address,
            threshold: 1
          }
        })
      }).toThrow('safeOptions.owners is required and must not be empty')
    })

    test('should throw if threshold is less than 1', () => {
      expect(() => {
        new WalletAccountReadOnlyMultisigSafe({
          ...MOCK_CONFIG,
          safeOptions: {
            owners: [ACCOUNT.address],
            threshold: 0
          }
        })
      }).toThrow('threshold must be at least 1')
    })

    test('should throw if threshold is negative', () => {
      expect(() => {
        new WalletAccountReadOnlyMultisigSafe({
          ...MOCK_CONFIG,
          safeOptions: {
            owners: [ACCOUNT.address],
            threshold: -1
          }
        })
      }).toThrow('threshold must be at least 1')
    })

    test('should throw if threshold exceeds number of owners', () => {
      expect(() => {
        new WalletAccountReadOnlyMultisigSafe({
          ...MOCK_CONFIG,
          safeOptions: {
            owners: [ACCOUNT.address],
            threshold: 2
          }
        })
      }).toThrow('threshold cannot exceed number of owners')
    })

    test('should throw if safe modules version is unsupported', () => {
      expect(() => {
        new WalletAccountReadOnlyMultisigSafe({
          ...MOCK_CONFIG,
          safeModulesVersion: '0.1.0',
          safeOptions: {
            safeAddress: MOCK_SAFE_ADDRESS
          }
        })
      }).toThrow("Unsupported 'safeModulesVersion': '0.1.0'. Supported versions: 0.2.0.")
    })

    test('should accept valid 2-of-3 config', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address, ACCOUNT_2.address, '0x3333333333333333333333333333333333333333'],
          threshold: 2
        }
      })

      expect(account).toBeDefined()
    })

    test('should accept valid 1-of-1 config', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      expect(account).toBeDefined()
    })

    test('should accept PredictedSafeOptions with saltNonce', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1,
          saltNonce: '0x1234567890'
        }
      })

      expect(account).toBeDefined()
      expect(account._config.safeOptions.saltNonce).toBe('0x1234567890')
    })

    test('should successfully initialize with ERC-20 paymaster options', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=dummy-key',
        paymasterTokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      expect(account._config.paymasterTokenAddress).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
      expect(account._config.isSponsored).toBeUndefined()
    })

    test('should successfully initialize with sponsored paymaster and sponsorshipPolicyId', () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=sponsor-key',
        isSponsored: true,
        sponsorshipPolicyId: 'sp_my_policy_123',
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      expect(account._config.isSponsored).toBe(true)
      expect(account._config.sponsorshipPolicyId).toBe('sp_my_policy_123')
    })
  })

  describe('getAddress', () => {
    test('should return cached safeAddress when provided via ExistingSafeOptions', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      const address = await account.getAddress()

      expect(address).toBe(MOCK_SAFE_ADDRESS)
    })

    test('should return deterministic address when PredictedSafeOptions provided', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })

      const address = await account.getAddress()

      expect(address).toBe(PREDICTED_SAFE_ADDRESS)
    })
  })

  describe('isDeployed', () => {
    test('should return true when Safe is deployed', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })
      account._provider = { request: jest.fn().mockResolvedValue('0x6080604052') }

      const isDeployed = await account.isDeployed()

      expect(isDeployed).toBe(true)
    })

    test('should return false when Safe is not deployed', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })
      account._provider = { request: jest.fn().mockResolvedValue('0x') }

      const isDeployed = await account.isDeployed()

      expect(isDeployed).toBe(false)
    })
  })

  describe('getOwners', () => {
    test('should return owners from deployed Safe', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      const mockOwners = [ACCOUNT.address, ACCOUNT_2.address]
      account.isDeployed = jest.fn().mockResolvedValue(true)
      account._getSmartAccount = jest.fn().mockResolvedValue(createMockSmartAccount({
        getOwners: jest.fn().mockResolvedValue(mockOwners)
      }))

      const owners = await account.getOwners()

      expect(owners).toEqual(mockOwners)
    })

    test('should return owners from options when not deployed', async () => {
      const configOwners = [ACCOUNT.address, ACCOUNT_2.address]
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: configOwners,
          threshold: 2
        }
      })
      account.isDeployed = jest.fn().mockResolvedValue(false)

      const owners = await account.getOwners()

      expect(owners).toEqual(configOwners)
    })
  })

  describe('getThreshold', () => {
    test('should return threshold from deployed Safe', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })
      account.isDeployed = jest.fn().mockResolvedValue(true)
      account._getSmartAccount = jest.fn().mockResolvedValue(createMockSmartAccount({
        getThreshold: jest.fn().mockResolvedValue(2)
      }))

      const threshold = await account.getThreshold()

      expect(threshold).toBe(2)
    })

    test('should return threshold from options when not deployed', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address, ACCOUNT_2.address],
          threshold: 2
        }
      })
      account.isDeployed = jest.fn().mockResolvedValue(false)

      const threshold = await account.getThreshold()

      expect(threshold).toBe(2)
    })
  })

  describe('getNonce', () => {
    test('should return the entrypoint nonce', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })
      account._provider = {
        request: jest.fn().mockResolvedValue('0x' + (5).toString(16).padStart(64, '0'))
      }

      const nonce = await account.getNonce()

      expect(nonce).toBe(5n)
    })
  })

  describe('getPaymasterTokenBalance', () => {
    test('should throw error when isSponsored=true (no token configured)', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=sponsor-key',
        isSponsored: true,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      await expect(account.getPaymasterTokenBalance())
        .rejects.toThrow("The account has no 'paymasterTokenAddress' configured.")
    })

    test('should throw error when no paymaster token configured', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })

      await expect(account.getPaymasterTokenBalance())
        .rejects.toThrow("The account has no 'paymasterTokenAddress' configured.")
    })
  })

  describe('generateDeterministicSaltNonce', () => {
    test('should generate a deterministic salt nonce', () => {
      const owners = ['0xAAA', '0xBBB']
      const threshold = 2

      const nonce = WalletAccountReadOnlyMultisigSafe.generateDeterministicSaltNonce(owners, threshold)

      expect(nonce).toBe('0xd45ee70b400735ca5d4e17ab824ff0322b670873eb9993b576a6157de4530277')
    })

    test('should return the same nonce regardless of owner order', () => {
      const nonce1 = WalletAccountReadOnlyMultisigSafe.generateDeterministicSaltNonce(['0xAAA', '0xBBB'], 2)
      const nonce2 = WalletAccountReadOnlyMultisigSafe.generateDeterministicSaltNonce(['0xBBB', '0xAAA'], 2)

      expect(nonce1).toBe(nonce2)
    })
  })

  describe('quoteExecuteProposal', () => {
    const PAYMASTER_TOKEN_ADDRESS = '0x1234567890AbcdEF1234567890aBcdef12345678'
    const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
    const DUMMY_EXCHANGE_RATE = '0x77359400'

    const DUMMY_USER_OPERATION = {
      nonce: '0',
      initCode: '0x',
      callGasLimit: '100000',
      verificationGasLimit: '200000',
      preVerificationGas: '50000',
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '1000000000',
      paymasterAndData: '0x',
      paymasterVerificationGasLimit: '0',
      paymasterPostOpGasLimit: '0'
    }

    const DUMMY_PAYMASTER_USER_OPERATION = { ...DUMMY_USER_OPERATION, paymasterAndData: '0x' + 'ab'.repeat(40) }

    const createAccount = (config, userOperation) => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        ...config,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      account._coordinator = { getProposal: jest.fn().mockResolvedValue({ userOperation }) }
      return account
    }

    test('should include verificationGasLimit in the prefund quote for a no-paymaster operation', async () => {
      const account = createAccount({}, DUMMY_USER_OPERATION)

      const { fee } = await account.quoteExecuteProposal(MOCK_SAFE_OP_HASH)

      expect(fee).toBe(350000000000000n)
      expect(account._coordinator.getProposal).toHaveBeenCalledWith(MOCK_SAFE_OP_HASH)
    })

    test('should return the prefund in wei when the account pays with native coins but the operation carries a paymaster', async () => {
      const account = createAccount({}, DUMMY_PAYMASTER_USER_OPERATION)

      const { fee } = await account.quoteExecuteProposal(MOCK_SAFE_OP_HASH)

      expect(fee).toBe(750000000000000n)
    })

    test('should return zero when the account is sponsored', async () => {
      const account = createAccount({
        paymasterUrl: 'https://api.candide.dev/paymaster/v3/sepolia/dummy-key',
        isSponsored: true
      }, DUMMY_PAYMASTER_USER_OPERATION)

      const { fee } = await account.quoteExecuteProposal(MOCK_SAFE_OP_HASH)

      expect(fee).toBe(0n)
    })

    test('should return the fee in token units using the candide exchange rate', async () => {
      const PAYMASTER_URL = 'https://api.candide.dev/paymaster/v3/sepolia/dummy-key'
      const DUMMY_SUPPORTED_TOKENS = {
        paymasterMetadata: { address: '0x' + 'cd'.repeat(20) },
        tokens: [{ address: PAYMASTER_TOKEN_ADDRESS.toLowerCase(), exchangeRate: DUMMY_EXCHANGE_RATE }]
      }
      const account = createAccount({ paymasterUrl: PAYMASTER_URL, paymasterTokenAddress: PAYMASTER_TOKEN_ADDRESS }, DUMMY_PAYMASTER_USER_OPERATION)
      const sendRPCRequestMock = jest.fn().mockResolvedValue(DUMMY_SUPPORTED_TOKENS)
      account._getPaymaster = jest.fn().mockReturnValue({ sendRPCRequest: sendRPCRequestMock })

      const { fee } = await account.quoteExecuteProposal(MOCK_SAFE_OP_HASH)

      expect(account._getPaymaster).toHaveBeenCalledWith(PAYMASTER_URL, { chainId: 11155111n })
      expect(sendRPCRequestMock).toHaveBeenCalledWith('pm_supportedERC20Tokens', [ENTRY_POINT_ADDRESS])
      expect(fee).toBe(1500000n)
    })

    test('should return the fee in token units using the pimlico exchange rate', async () => {
      const PAYMASTER_URL = 'https://api.pimlico.io/v2/11155111/rpc?apikey=dummy-key'
      const DUMMY_TOKEN_QUOTES = {
        quotes: [{ token: PAYMASTER_TOKEN_ADDRESS, exchangeRate: DUMMY_EXCHANGE_RATE, paymaster: '0x' + 'cd'.repeat(20) }]
      }
      const account = createAccount({ paymasterUrl: PAYMASTER_URL, paymasterTokenAddress: PAYMASTER_TOKEN_ADDRESS }, DUMMY_PAYMASTER_USER_OPERATION)
      const sendRPCRequestMock = jest.fn().mockResolvedValue(DUMMY_TOKEN_QUOTES)
      account._getPaymaster = jest.fn().mockReturnValue({ sendRPCRequest: sendRPCRequestMock })

      const { fee } = await account.quoteExecuteProposal(MOCK_SAFE_OP_HASH)

      expect(sendRPCRequestMock).toHaveBeenCalledWith('pimlico_getTokenQuotes', [{ tokens: [PAYMASTER_TOKEN_ADDRESS] }, ENTRY_POINT_ADDRESS, '0xaa36a7'])
      expect(fee).toBe(1500000n)
    })

    test('should return the prefund in wei when the paymaster provider is unknown', async () => {
      const account = createAccount({
        paymasterUrl: 'https://paymaster.dummy-network.example/rpc?apikey=dummy-key',
        paymasterTokenAddress: PAYMASTER_TOKEN_ADDRESS
      }, DUMMY_PAYMASTER_USER_OPERATION)
      account._getPaymaster = jest.fn()

      const { fee } = await account.quoteExecuteProposal(MOCK_SAFE_OP_HASH)

      expect(account._getPaymaster).not.toHaveBeenCalled()
      expect(fee).toBe(750000000000000n)
    })

    test('should throw if the paymaster does not support the configured token', async () => {
      const account = createAccount({
        paymasterUrl: 'https://api.candide.dev/paymaster/v3/sepolia/dummy-key',
        paymasterTokenAddress: PAYMASTER_TOKEN_ADDRESS
      }, DUMMY_PAYMASTER_USER_OPERATION)
      account._getPaymaster = jest.fn().mockReturnValue({
        sendRPCRequest: jest.fn().mockResolvedValue({ paymasterMetadata: { address: '0x' + 'cd'.repeat(20) }, tokens: [] })
      })

      const promise = account.quoteExecuteProposal(MOCK_SAFE_OP_HASH)

      await expect(promise).rejects.toThrow(InvalidTokenError)
      await expect(promise).rejects.toThrow(`The paymaster does not support the token set in the 'paymasterTokenAddress' option: ${PAYMASTER_TOKEN_ADDRESS}.`)
    })
  })

  describe('quoteDeploy', () => {
    test('should return fee estimate for deployment', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          owners: [ACCOUNT.address],
          threshold: 1
        }
      })
      account.isDeployed = jest.fn().mockResolvedValue(false)
      account._buildDeploymentTransaction = jest.fn().mockReturnValue({
        to: '0xDeployFactory',
        value: 0n,
        data: '0xdeploydata'
      })

      const mockEvmReadOnly = {
        quoteSendTransaction: jest.fn().mockResolvedValue({ fee: 210000n })
      }
      account._getEvmReadOnlyAccount = jest.fn().mockResolvedValue(mockEvmReadOnly)

      const result = await account.quoteDeploy()

      expect(result.fee).toBe(210000n)
      expect(mockEvmReadOnly.quoteSendTransaction).toHaveBeenCalledWith({
        to: '0xDeployFactory',
        value: 0n,
        data: '0xdeploydata'
      })
    })

    test('should throw if Safe is already deployed', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: {
          safeAddress: MOCK_SAFE_ADDRESS
        }
      })
      account.isDeployed = jest.fn().mockResolvedValue(true)

      await expect(account.quoteDeploy())
        .rejects.toThrow('Safe is already deployed')
    })
  })

  describe('getMessageProposals', () => {
    test('should return a map of message proposals', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      const mockCoordinator = createMockCoordinator({
        getMessage: jest.fn().mockResolvedValue({
          messageHash: MOCK_MESSAGE_HASH,
          message: 'Hello!',
          confirmations: [{ owner: ACCOUNT.address }],
          preparedSignature: '0xpreparedsig'
        })
      })
      account._threshold = 1
      account._coordinator = mockCoordinator

      const result = await account.getMessageProposals([MOCK_MESSAGE_HASH])
      const message = result[MOCK_MESSAGE_HASH]

      expect(message.messageId).toBe(MOCK_MESSAGE_HASH)
      expect(message.message).toBe('Hello!')
      expect(message.confirmations).toBe(1)
      expect(message.threshold).toBe(1)
      expect(message.combinedSignature).toBe('0xpreparedsig')
    })

    test('should map an id to null when the message is not found', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      const mockCoordinator = createMockCoordinator({
        getMessage: jest.fn().mockResolvedValue(null)
      })
      account._threshold = 1
      account._coordinator = mockCoordinator

      const result = await account.getMessageProposals([MOCK_MESSAGE_HASH])

      expect(result[MOCK_MESSAGE_HASH]).toBeNull()
    })

    test('should map each id to its message proposal', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      const mockCoordinator = createMockCoordinator({
        getMessage: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            messageHash: 'hash2',
            message: 'Second',
            confirmations: [{ owner: ACCOUNT.address }],
            preparedSignature: null
          })
      })
      account._threshold = 1
      account._coordinator = mockCoordinator

      const result = await account.getMessageProposals(['hash1', 'hash2'])

      expect(result.hash1).toBeNull()
      expect(result.hash2.message).toBe('Second')
    })
  })

  describe('getProposals', () => {
    test('should return a map of proposals', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      const mockCoordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }]
        })
      })
      account._threshold = 1
      account._coordinator = mockCoordinator

      const result = await account.getProposals([MOCK_SAFE_OP_HASH])
      const proposal = result[MOCK_SAFE_OP_HASH]

      expect(proposal.proposalId).toBe(MOCK_SAFE_OP_HASH)
      expect(proposal.confirmations).toBe(1)
      expect(proposal.threshold).toBe(1)
      expect(proposal.status).toBe('pending')
    })

    test('should mark a proposal executed when its user operation has an on-chain tx hash', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      const mockCoordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue({
          confirmations: [{ owner: ACCOUNT.address }],
          userOperation: { ethereumTxHash: '0xabc' }
        })
      })
      account._threshold = 1
      account._coordinator = mockCoordinator

      const result = await account.getProposals([MOCK_SAFE_OP_HASH])

      expect(result[MOCK_SAFE_OP_HASH].status).toBe('executed')
    })

    test('should map an id to null when the proposal is not found', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      const mockCoordinator = createMockCoordinator({
        getProposal: jest.fn().mockResolvedValue(null)
      })
      account._threshold = 1
      account._coordinator = mockCoordinator

      const result = await account.getProposals([MOCK_SAFE_OP_HASH])

      expect(result[MOCK_SAFE_OP_HASH]).toBeNull()
    })

    test('should map each id to its proposal', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      const mockCoordinator = createMockCoordinator({
        getProposal: jest.fn()
          .mockResolvedValueOnce({
            confirmations: [{ owner: ACCOUNT.address }]
          })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            confirmations: [{ owner: ACCOUNT.address }, { owner: ACCOUNT_2.address }]
          })
      })
      account._threshold = 1
      account._coordinator = mockCoordinator

      const result = await account.getProposals(['hash1', 'hash2', 'hash3'])

      expect(result.hash1.confirmations).toBe(1)
      expect(result.hash2).toBeNull()
      expect(result.hash3.confirmations).toBe(2)
    })
  })

  describe('verify', () => {
    test('should return true when the Safe returns the EIP-1271 magic value', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      account._provider = {
        request: jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE + '0'.repeat(56))
      }

      const result = await account.verify('Hello', VALID_SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for invalid signature', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      account._provider = {
        request: jest.fn().mockResolvedValue('0x' + '0'.repeat(64))
      }

      const result = await account.verify('Hello', VALID_SIGNATURE)

      expect(result).toBe(false)
    })

    test('should return false when the call reverts', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      account._provider = {
        request: jest.fn().mockRejectedValue(new Error('execution reverted'))
      }

      const result = await account.verify('Hello', VALID_SIGNATURE)

      expect(result).toBe(false)
    })
  })

  describe('getVersion', () => {
    test('should return "not deployed" when the Safe is not deployed', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      account.isDeployed = jest.fn().mockResolvedValue(false)

      const version = await account.getVersion()

      expect(version).toBe('not deployed')
    })

    test('should return the on-chain version when deployed', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })
      account.isDeployed = jest.fn().mockResolvedValue(true)
      account._provider = {
        request: jest.fn().mockResolvedValue(AbiCoder.defaultAbiCoder().encode(['string'], ['1.4.1']))
      }

      const version = await account.getVersion()

      expect(version).toBe('1.4.1')
    })
  })

  describe('getTransactionReceipt', () => {
    test('should return EvmTransactionReceipt for regular tx hash', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })

      const mockReceipt = { hash: '0xtxhash', status: 1 }
      const mockEvmReadOnly = {
        getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt)
      }
      account._getEvmReadOnlyAccount = jest.fn().mockResolvedValue(mockEvmReadOnly)

      const result = await account.getTransactionReceipt('0xtxhash')

      expect(result).toBe(mockReceipt)
      expect(mockEvmReadOnly.getTransactionReceipt).toHaveBeenCalledWith('0xtxhash')
    })

    test('should return UserOperationReceipt for UserOp hash', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })

      const mockEvmReadOnly = {
        getTransactionReceipt: jest.fn().mockResolvedValue(null)
      }
      account._getEvmReadOnlyAccount = jest.fn().mockResolvedValue(mockEvmReadOnly)

      const mockUserOpReceipt = { userOpHash: '0xuserophash', success: true }
      account._getBundler = jest.fn().mockReturnValue({
        getUserOperationReceipt: jest.fn().mockResolvedValue(mockUserOpReceipt)
      })

      const result = await account.getTransactionReceipt('0xuserophash')

      expect(result).toBe(mockUserOpReceipt)
    })

    test('should return null when hash is not found', async () => {
      const account = new WalletAccountReadOnlyMultisigSafe({
        ...MOCK_CONFIG,
        safeOptions: { safeAddress: MOCK_SAFE_ADDRESS }
      })

      const mockEvmReadOnly = {
        getTransactionReceipt: jest.fn().mockResolvedValue(null)
      }
      account._getEvmReadOnlyAccount = jest.fn().mockResolvedValue(mockEvmReadOnly)
      account._getBundler = jest.fn().mockReturnValue({
        getUserOperationReceipt: jest.fn().mockResolvedValue(null)
      })

      const result = await account.getTransactionReceipt('0xunknown')

      expect(result).toBeNull()
    })
  })
})
