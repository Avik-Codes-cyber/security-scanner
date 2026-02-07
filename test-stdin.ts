#!/usr/bin/env bun
/**
 * Test stdin handling
 */

console.log("Testing stdin...");
console.log("TTY:", process.stdin.isTTY);

process.stdin.setEncoding('utf8');
process.stdin.resume();

console.log("Type something and press Enter:");

process.stdin.on('data', (data) => {
    console.log("Received:", JSON.stringify(data));
    console.log("Bytes:", Buffer.from(data.toString()).toString('hex'));

    if (data.toString().includes('\n') || data.toString().includes('\r')) {
        console.log("Got newline!");
        process.exit(0);
    }
});

setTimeout(() => {
    console.log("Timeout - no input received");
    process.exit(1);
}, 10000);
