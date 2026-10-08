import { describe, expect, test, beforeAll, afterAll } from '@jest/globals'
import { ethers } from 'ethers'
import { alto } from 'prool/instances'
import path from 'path'

import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

import { WalletAccountMultisigSafe } from '../../index.js'
import InMemoryCoordinator from '../helpers/in-memory-coordinator.js'

const TIMEOUT = 120000

const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const PROVIDER_URL = 'http://localhost:8545'
const BUNDLER_URL = 'http://localhost:4337'
const CHAIN_ID = 1n

// Hardhat account #0 — funds the signer EOAs (deploy gas) and the Safe (UserOperation prefund).
const FUNDER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

// Three distinct owners, each a "separate signer" with their own seed.
const SEED_A = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const SEED_B = 'test test test test test test test test test test test junk'
const SEED_C = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const SEED_D = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const ethersProvider = new ethers.JsonRpcProvider(PROVIDER_URL)

function resolveAltoCli () {
  return path.resolve(process.cwd(), 'node_modules', '@pimlico', 'alto', 'esm', 'cli', 'alto.js')
}

async function waitForTx (txHash, account) {
  for (let i = 0; i < 60; i++) {
    try {
      const receipt = await account.getTransactionReceipt(txHash)
      if (receipt) return receipt
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Transaction not mined after 60s: ${txHash}`)
}

async function waitForDeploy (account) {
  for (let i = 0; i < 30; i++) {
    if (await account.isDeployed()) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Safe not deployed after 30s')
}

describe('@wdk/wallet-multisig-safe — distributed multisig (integration)', () => {
  let bundlerInstance
  let coordinator
  let baseConfig
  let owners
  let signerA, signerB, signerC
  let safeAddress

  const deriveEoa = async (seed) => {
    const tmp = new WalletAccountMultisigSafe(seed, "0'/0/0", {
      ...baseConfig,
      safeOptions: { owners: ['0x0000000000000000000000000000000000000001'], threshold: 1 }
    })
    const address = await tmp.getSignerAddress()
    tmp.dispose()
    return address
  }

  beforeAll(async () => {
    bundlerInstance = alto({
      port: 4337,
      entrypoints: [ENTRY_POINT_ADDRESS],
      rpcUrl: PROVIDER_URL,
      'executor-private-keys': [FUNDER_KEY],
      'utility-private-key': [FUNDER_KEY],
      safeMode: false,
      pollingInterval: 0,
      binary: resolveAltoCli()
    })
    await bundlerInstance.start()

    coordinator = new InMemoryCoordinator(CHAIN_ID)

    baseConfig = {
      chainId: CHAIN_ID,
      provider: PROVIDER_URL,
      bundlerUrl: BUNDLER_URL,
      safeModulesVersion: '0.2.0',
      useNativeCoins: true,
      coordinator
    }

    owners = await Promise.all([deriveEoa(SEED_A), deriveEoa(SEED_B), deriveEoa(SEED_C)])

    const config = { ...baseConfig, safeOptions: { owners, threshold: 2 } }

    signerA = new WalletAccountMultisigSafe(SEED_A, "0'/0/0", config)
    signerB = new WalletAccountMultisigSafe(SEED_B, "0'/0/0", config)
    // Signer C is built from a wallet-evm account to exercise the caller-supplied owner path end to end
    signerC = new WalletAccountMultisigSafe(new WalletAccountEvm(SEED_C, "0'/0/0", { provider: PROVIDER_URL }), config)

    safeAddress = await signerA.getAddress()

    const setBalance = (addr, eth) =>
      ethersProvider.send('hardhat_setBalance', ['0x' + ethers.getAddress(addr).slice(2), '0x' + ethers.parseEther(eth).toString(16)])
    const clearCode = (addr) =>
      ethersProvider.send('hardhat_setCode', ['0x' + ethers.getAddress(addr).slice(2), '0x'])

    // On the 2026 mainnet fork these well-known test EOAs carry EIP-7702 delegations whose delegate
    // reverts on a plain call, so clear the deployer EOA's code and fund via direct state writes
    // (the deployer EOA pays the Safe deployment gas; the Safe pays its own UserOperation gas).
    const signerAEoa = await signerA.getSignerAddress()
    await clearCode(signerAEoa)
    await setBalance(signerAEoa, '10')
    await setBalance(safeAddress, '20')

    await signerA.deploy()
    await waitForDeploy(signerA)
  }, TIMEOUT)

  afterAll(async () => {
    await bundlerInstance.stop()
  }, TIMEOUT)

  test('all signers predict the same Safe address; on-chain owners/threshold match config (predicted == deployed)', async () => {
    expect(await signerB.getAddress()).toBe(safeAddress)
    expect(await signerC.getAddress()).toBe(safeAddress)

    expect(await signerA.isDeployed()).toBe(true)

    const onChainOwners = await signerA.getOwners()
    expect(onChainOwners.map(o => o.toLowerCase()).sort())
      .toEqual(owners.map(o => o.toLowerCase()).sort())

    expect(await signerA.getThreshold()).toBe(2)
  }, TIMEOUT)

  test('distributed 2-of-3: propose (A) -> approve (B) -> execute (C) transfers ETH on-chain', async () => {
    const recipient = '0x000000000000000000000000000000000000dEaD'
    const amount = ethers.parseEther('1')
    const balanceBefore = await ethersProvider.getBalance(recipient)

    const proposal = await signerA.propose({ to: recipient, value: amount, data: '0x' })
    expect(proposal.status).toBe('pending')
    expect(proposal.confirmations).toBe(1)
    expect(proposal.threshold).toBe(2)

    const approval = await signerB.approveProposal(proposal.proposalId)
    expect(approval.confirmations).toBe(2)

    expect(await signerC.isReadyToExecute(proposal.proposalId)).toBe(true)

    const exec = await signerC.executeProposal(proposal.proposalId)
    await waitForTx(exec.hash, signerA)

    const balanceAfter = await ethersProvider.getBalance(recipient)
    expect(balanceAfter - balanceBefore).toBe(amount)
  }, TIMEOUT)

  test('autoExecute does not execute below threshold', async () => {
    const result = await signerA.propose(
      { to: '0x000000000000000000000000000000000000dEaD', value: 0n, data: '0x' },
      { autoExecute: true }
    )

    expect(result.status).toBe('pending')
    expect(result.confirmations).toBe(1)
  }, TIMEOUT)

  test('distributed message signing: propose (A) -> approve (B) -> verify EIP-1271 on-chain', async () => {
    const message = 'Hello from a distributed Safe multisig!'

    const proposal = await signerA.proposeMessage(message)
    expect(proposal.confirmations).toBe(1)
    expect(proposal.threshold).toBe(2)

    const approval = await signerB.approveMessageProposal(proposal.messageId)
    expect(approval.confirmations).toBe(2)
    expect(approval.combinedSignature).toBeTruthy()

    const isValid = await signerA.verify(message, approval.combinedSignature)
    expect(isValid).toBe(true)
  }, TIMEOUT)

  test('owner management: addOwner proposed, approved and executed adds the owner on-chain', async () => {
    const newOwner = await deriveEoa(SEED_D)

    const proposal = await signerA.addOwner(newOwner)
    await signerB.approveProposal(proposal.proposalId)

    const exec = await signerA.executeProposal(proposal.proposalId)
    await waitForTx(exec.hash, signerA)

    signerA._resetState()
    const updatedOwners = await signerA.getOwners()

    expect(updatedOwners.map(o => o.toLowerCase())).toContain(newOwner.toLowerCase())
  }, TIMEOUT)

  test('owner management: updateOwners removes multiple adjacent owners in one batch', async () => {
    signerA._resetState()
    const before = await signerA.getOwners()
    expect(before.length).toBe(4)

    const keep = [before[0], before[before.length - 1]]

    const proposal = await signerA.updateOwners(keep, 1)
    await signerB.approveProposal(proposal.proposalId)

    const exec = await signerA.executeProposal(proposal.proposalId)
    await waitForTx(exec.hash, signerA)

    signerA._resetState()
    const after = await signerA.getOwners()

    expect(after.map(o => o.toLowerCase()).sort()).toEqual(keep.map(o => o.toLowerCase()).sort())
  }, TIMEOUT)

  test('owner management: updateOwners adds an owner and removes the current head owner in one batch', async () => {
    const NEW_OWNER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

    signerA._resetState()
    const before = await signerA.getOwners()
    const head = before[0]

    const signers = [signerA, signerB, signerC]
    const signerAddresses = await Promise.all(signers.map(s => s.getSignerAddress()))
    const beforeLower = before.map(o => o.toLowerCase())
    const proposer = signers[signerAddresses.findIndex(a => beforeLower.includes(a.toLowerCase()))]

    const desired = [NEW_OWNER, ...before.filter(o => o.toLowerCase() !== head.toLowerCase())]

    const proposal = await proposer.updateOwners(desired, 1)
    const exec = await proposer.executeProposal(proposal.proposalId)
    await waitForTx(exec.hash, proposer)

    proposer._resetState()
    const after = await proposer.getOwners()

    expect(after.map(o => o.toLowerCase()).sort()).toEqual(desired.map(o => o.toLowerCase()).sort())
  }, TIMEOUT)
})
