console.log(`
=== TRIGGER MONITORING ALERT ===

The monitoring agent watches for balance changes on Base Sepolia.
To trigger an alert:

1. Open MetaMask → switch to Base Sepolia network
2. Send a small amount (0.0001 ETH) to any address
   Example: 0x0000000000000000000000000000000000000001
3. Wait 5-10 seconds
4. Check XMTP — you should receive a portfolio briefing!

Or check monitoring status:
  curl http://localhost:4021/api/monitor/status
`)
