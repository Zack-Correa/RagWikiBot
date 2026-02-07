/**
 * Extract auth token from Wireshark capture hex dump
 * 
 * Usage:
 *   1. Capture login packet (0x0825) in Wireshark
 *   2. Copy hex dump of the packet (client -> server, 417 bytes)
 *   3. Paste as first argument or edit this file
 */

const hex = process.argv[2] || 'e4388391a27650ebf626b7ee0800450001c9bcf6400080060000c0a801abac41a8b9d5c41af467fb736855b599c0501800ff190a00002508a10101000000167a61636b7261676e61726f6b40676d61696c2e636f6d0060305400a869c119efff7f3f00000000ac05f913fecaadba0000000035302d45422d46362d32362d42372d45453139322e3136382e312e3137310000567932337a477539684c7247717a7577724e756f79383937664e50655356525156456e6e306d2f2b35645371652f472b3171444443504e74543134346e6d534a4632423373594f42714d4a733346565072786a4d5a4d44724669674e2f34456d5052496956452b596479684830786146554a4265736c632f513239506d383265364d3858324269784462766d3555634747505064656647452b367041582f5136416b767468726372555253306257457565516c5a677368484763366271584457554f582f6d6d6478667237474257577a5a72744a584756767438745038747374554a4775656978764275366178555a634f79557944716142554c774d3334617867356c5265776e694a2f466d7634384870556832574e54616e414e2b4864376b2b776e62757678595830584a53623433473748614a336955306854732f376e656335395667';

console.log('=== GNJoy LATAM Token Extractor ===\n');

const buf = Buffer.from(hex, 'hex');
// Skip Ethernet(14) + IP(20) + TCP(20) = 54 bytes
const payload = buf.slice(54);

if (payload.length < 417) {
    console.error('Error: Packet too short. Expected 417 bytes, got', payload.length);
    console.error('Make sure you copied the full hex dump from Wireshark.');
    process.exit(1);
}

const pktId = payload.readUInt16LE(0);
if (pktId !== 0x0825) {
    console.error('Error: Not a 0x0825 SSO login packet. Got 0x' + pktId.toString(16));
    process.exit(1);
}

// Token starts at offset 92, length 325 bytes
const token = payload.slice(92, 417);
const tokenStr = token.toString('ascii').replace(/\0/g, '').trim();

console.log('✅ Token extracted successfully!\n');
console.log('Add this to your .env file:');
console.log('─'.repeat(60));
console.log(`RO_PROBE_USERNAME=zackragnarok@gmail.com`);
console.log(`RO_AUTH_TOKEN=${tokenStr}`);
console.log('─'.repeat(60));
console.log('\nNote: Replace the username with your actual account email.');
console.log('The token is valid for a limited time. You may need to extract a new one periodically.');
