import { db } from '../data/index.js'
import { authService } from './auth.service.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const donationService = {
  async getFunds() {
    await delay()
    return { data: db.get('donationFunds') }
  },

  async getHistory(donorId) {
    await delay()
    let targetId = donorId
    if (!targetId) {
      const session = await authService.getSession()
      targetId = session.data.id
    }
    const donations = db.get('donations')
    const userDonations = donations.filter((d) => d.donorId === targetId)

    return {
      data: userDonations,
      meta: { total: userDonations.length },
    }
  },

  async getAllDonations() {
    await delay()
    const donations = db.get('donations')
    return {
      data: donations,
      meta: { total: donations.length },
    }
  },

  async donate(payload) {
    await delay(180)
    const session = await authService.getSession()
    const user = session.data
    const funds = db.get('donationFunds')
    const fund = funds.find((f) => f.id === payload.fundId) || funds[0]
    const amount = Number(payload.amount) || 5000

    const newDonation = {
      id: `don_${Date.now()}`,
      receiptNumber: `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      donorId: user.id,
      donorName: user.name,
      donorEmail: user.email,
      fundId: fund.id,
      fundName: fund.name,
      amount,
      currency: 'INR',
      date: new Date().toISOString(),
      status: 'completed',
      paymentMethod: payload.paymentMethod || 'UPI / NetBanking',
      taxExemption80G: `80G-CERT-${new Date().getFullYear()}-VIT-${Math.floor(1000 + Math.random() * 9000)}`,
      isAnonymous: Boolean(payload.isAnonymous),
      message: payload.message || null,
    }

    db.insert('donations', newDonation)

    // Update fund total raised
    db.update('donationFunds', (f) => f.id === fund.id, (f) => ({
      ...f,
      raised: (f.raised || 0) + amount,
      donorCount: (f.donorCount || 0) + 1,
    }))

    return {
      data: newDonation,
      message: 'Donation processed successfully! Tax receipt is ready for download.',
    }
  },
}
