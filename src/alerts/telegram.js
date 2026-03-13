/**
 * Telegram Alerts
 * Sends alerts via Telegram bot
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Send alert message via Telegram
 * 
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} Success status
 */
async function sendAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    logger.warn('[Telegram] Telegram not configured, skipping alert');
    return false;
  }

  try {
    const url = `${TELEGRAM_API}${token}/sendMessage`;
    
    const response = await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    });

    if (response.data.ok) {
      logger.info('[Telegram] Alert sent successfully');
      return true;
    } else {
      logger.error('[Telegram] Telegram API error:', response.data);
      return false;
    }
  } catch (error) {
    logger.error('[Telegram] Error sending alert:', error.message);
    return false;
  }
}

/**
 * Send attack alert
 */
async function sendAttackAlert(walletAddress, txHash) {
  const message = `⚠️ *Attack Detected*\n\n` +
    `*Wallet:* \`${walletAddress}\`\n` +
    `*Transaction:* \`${txHash}\`\n` +
    `*Time:* ${new Date().toISOString()}`;

  return sendAlert(message);
}

/**
 * Send rescue success alert
 */
async function sendRescueSuccessAlert(walletAddress, rescueAmount, txHash) {
  const message = `✅ *Rescue Successful*\n\n` +
    `*Wallet:* \`${walletAddress}\`\n` +
    `*Rescued:* ${rescueAmount}\n` +
    `*Tx Hash:* \`${txHash}\`\n` +
    `*Time:* ${new Date().toISOString()}`;

  return sendAlert(message);
}

/**
 * Send rescue failure alert
 */
async function sendRescueFailureAlert(walletAddress, error) {
  const message = `❌ *Rescue Failed*\n\n` +
    `*Wallet:* \`${walletAddress}\`\n` +
    `*Error:* ${error}\n` +
    `*Time:* ${new Date().toISOString()}`;

  return sendAlert(message);
}

/**
 * Send bot status alert
 */
async function sendStatusAlert(status) {
  const message = `🤖 *Bot Status Update*\n\n` +
    `*Status:* ${status}\n` +
    `*Time:* ${new Date().toISOString()}`;

  return sendAlert(message);
}

/**
 * Send health check alert
 */
async function sendHealthCheckAlert(checkName, status) {
  const emoji = status === 'healthy' ? '✅' : '❌';
  const message = `${emoji} *Health Check*\n\n` +
    `*Check:* ${checkName}\n` +
    `*Status:* ${status}\n` +
    `*Time:* ${new Date().toISOString()}`;

  return sendAlert(message);
}

module.exports = {
  sendAlert,
  sendAttackAlert,
  sendRescueSuccessAlert,
  sendRescueFailureAlert,
  sendStatusAlert,
  sendHealthCheckAlert,
};
