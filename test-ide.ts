// Test script to verify IDE extension discovery
import { discoverIDEExtensions } from "./src/scanner/ide-extensions.ts";

async function test() {
  console.log("Discovering IDE extensions...");
  const extensions = await discoverIDEExtensions();
  console.log(`Found ${extensions.length} IDE extensions:\n`);

  const byIDE: Record<string, typeof extensions> = {};
  for (const ext of extensions) {
    if (!byIDE[ext.ide]) byIDE[ext.ide] = [];
    byIDE[ext.ide].push(ext);
  }

  for (const [ide, exts] of Object.entries(byIDE)) {
    console.log(`${ide} (${exts.length}):`);
    for (const ext of exts.slice(0, 5)) {
      console.log(`  - ${ext.name} (${ext.extensionId})`);
    }
    if (exts.length > 5) {
      console.log(`  ... and ${exts.length - 5} more`);
    }
    console.log();
  }
}

test();
